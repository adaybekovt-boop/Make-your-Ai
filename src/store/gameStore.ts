import { sellServerById, setServerOverclock, deployReserveServer } from '../systems/placement'
import type { AnyLocationId, GridPosition } from '../systems/types'
import { create } from 'zustand'
import { BALANCE_VERSION, TOKEN_PRICE_MAX, TOKEN_PRICE_MIN } from '../systems/config'
import { advanceSimulation, buyLocation, createInitialGame, unlockRegion } from '../systems/simulation'
import { buyCityTower, type CityTowerId } from '../systems/city'
import { acceptAcquisition } from '../systems/market'
import { mountChassisFromInventory, mountChipFromInventory, orderEquipment, type OrderRequest } from '../systems/procurement'
import { changeReputation } from '../systems/reputation'
import { buyDataLot, startTraining } from '../systems/training'
import { runBenchmark, togglePreparing } from '../systems/benchmark'
import { acceptContract, declineContract } from '../systems/contracts'
import { attemptEspionage } from '../systems/competitor'
import { fireEmployee, hireEmployee, toggleOverwork } from '../systems/team'
import { unlockTech } from '../systems/market'
import type { ActionResult, ChipId, ContractKind, DataQuality, GameSpeed, GameState, LocationId, Personality, RegionLocationId, TechNodeId } from '../systems/types'
import { loadGame, saveGame } from '../persistence/saves'

interface ProcurementRequest {
  locationId: AnyLocationId
  position: GridPosition | null
  serverId?: string | null
}

interface Notice {
  message: string
  kind: 'success' | 'error' | 'info'
  id: number
}

interface GameStore {
  game: GameState
  selectedId: LocationId
  ready: boolean
  saving: boolean
  storageEnabled: boolean
  savedAt: string | null
  notice: Notice | null
  procurement: ProcurementRequest | null
  initialize: () => Promise<void>
  selectLocation: (id: LocationId) => void
  sellAt: (id: AnyLocationId, serverId: string) => void
  overclockAt: (id: AnyLocationId, serverId: string, value: number) => void
  deployReserve: (id: AnyLocationId, serverId: string, position: GridPosition) => void
  purchaseCityTower: (id: CityTowerId) => void
  purchaseLocation: (id: LocationId | RegionLocationId) => void
  openProcurement: (request: { locationId: AnyLocationId; position: GridPosition | null; serverId?: string | null }) => void
  closeProcurement: () => void
  orderEquipment: (request: OrderRequest) => void
  mountChip: (id: AnyLocationId, position: GridPosition, chip: ChipId) => void
  mountChassis: (id: AnyLocationId, position?: GridPosition) => void
  tick: (seconds: number) => void
  togglePause: () => void
  setSpeed: (speed: GameSpeed) => void
  persist: (manual?: boolean) => Promise<void>
  restore: () => Promise<void>
  reset: () => Promise<void>
  dismissNotice: () => void
  buyDataLot: (quality: DataQuality) => void
  startTraining: () => void
  setPersonality: (personality: Personality) => void
  runBenchmark: () => void
  togglePreparing: () => void
  acceptContract: (variant: ContractKind) => void
  declineContract: () => void
  hireEmployee: (role: 'safety' | 'engineer') => void
  fireEmployee: (id: number) => void
  toggleOverwork: () => void
  toggleAdvertising: () => void
  setTokenPrice: (percent: number) => void
  toggleInsurance: () => void
  toggleLicense: () => void
  chooseOpenSource: (open: boolean) => void
  unlockTech: (id: TechNodeId) => void
  attemptEspionage: () => void
  unlockRegion: (regionId: string) => void
  acceptAcquisition: () => void
  declineAcquisition: () => void
}

let boot: Promise<void> | null = null
let saveQueue: Promise<void> = Promise.resolve()
let noticeSequence = 0

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Хранилище браузера недоступно.'
}

function pure(state: GameState): ActionResult {
  return { ok: true, state }
}

export const useGameStore = create<GameStore>((set, get) => {
  const notify = (message: string, kind: Notice['kind'] = 'info') =>
    set({ notice: { message, kind, id: ++noticeSequence } })

  const apply = (result: ActionResult, success?: string) => {
    if (!get().ready) return
    if (!result.ok) return notify(result.error, 'error')
    set({ game: result.state })
    if (success) notify(success, 'success')
  }

  const mutate = (fn: (game: GameState) => GameState, success?: string) => {
    apply(pure(fn(get().game)), success)
  }

  return {
    game: createInitialGame(),
    selectedId: 'garage',
    ready: false,
    saving: false,
    storageEnabled: true,
    savedAt: null,
    notice: null,
    procurement: null,
    initialize: () => {
      if (!boot) {
        boot = (async () => {
          try {
            const saved = await loadGame()
            if (saved) {
              set({ game: saved.game, savedAt: saved.savedAt })
              notify(saved.balanceVersion === BALANCE_VERSION
                ? 'Компания восстановлена. С возвращением!'
                : 'Сохранение восстановлено. Экономика пересчитана по текущему балансу.')
            }
          } catch (error) {
            set({ storageEnabled: false })
            notify(`Не удалось прочитать сохранение: ${errorMessage(error)} Автосохранение отключено, исходный файл не изменён.`, 'error')
          } finally {
            set({ ready: true })
          }
        })()
      }
      return boot
    },
    sellAt: (id, serverId) => apply(sellServerById(get().game, id, serverId), 'Сервер продан. Стойка осталась в ячейке.'),
    overclockAt: (id, serverId, value) => apply(setServerOverclock(get().game, id, serverId, value)),
    deployReserve: (id, serverId, position) => apply(deployReserveServer(get().game, id, serverId, position), 'Сервер из резерва размещён в комнате.'),
    selectLocation: (selectedId) => set({ selectedId }),
    purchaseCityTower: (id) => apply(buyCityTower(get().game, id), 'Здание куплено. Арендаторы приносят доход каждый игровой час.'),
    purchaseLocation: (id) => apply(buyLocation(get().game, id), `Локация приобретена. Закажите шасси в серверной комнате.`),
    openProcurement: (request) => set({ procurement: request }),
    closeProcurement: () => set({ procurement: null }),
    orderEquipment: (request) => {
      const result = orderEquipment(get().game, request)
      if (result.ok) {
        set({ game: result.state, procurement: null })
        notify('Заказ оформлен: оплата списана, оборудование в пути.', 'success')
      } else notify(result.error, 'error')
    },
    mountChip: (id, position, chip) => apply(mountChipFromInventory(get().game, id, position, chip), 'Чип смонтирован в стойку со склада.'),
    mountChassis: (id, position) => apply(mountChassisFromInventory(get().game, id, position), 'Стойка установлена в ячейку со склада.'),
    tick: (seconds) => {
      const state = get()
      if (!state.ready) return
      const game = advanceSimulation(state.game, seconds)
      if (game.pendingNotices.length > 0) {
        const [first, ...rest] = game.pendingNotices
        set({ game: { ...game, pendingNotices: rest }, notice: { message: first, kind: 'info', id: ++noticeSequence } })
      } else {
        set({ game })
      }
    },
    togglePause: () => set((state) => ({ game: { ...state.game, paused: !state.game.paused } })),
    setSpeed: (speed) => set((state) => ({ game: { ...state.game, speed } })),
    persist: (manual = false) => {
      const { game, ready, storageEnabled } = get()
      if (!ready || !storageEnabled) {
        if (manual) notify('Сохранение недоступно. Повторите загрузку или создайте новую компанию с подтверждением.', 'error')
        return Promise.resolve()
      }
      // Writes are serialized so an older autosave cannot replace a newer snapshot.
      const operation = saveQueue.then(async () => {
        set({ saving: true })
        try {
          const savedAt = await saveGame(game)
          set({ savedAt })
          if (manual) notify('Компания сохранена в этом браузере.', 'success')
        } catch (error) {
          notify(`Сохранить не удалось: ${errorMessage(error)}`, 'error')
        } finally {
          set({ saving: false })
        }
      })
      saveQueue = operation
      return operation
    },
    restore: async () => {
      set({ ready: false })
      await saveQueue
      try {
        const saved = await loadGame()
        if (!saved) {
          notify('Сохранения пока нет. Сначала сохраните компанию.')
        } else {
          set({ game: saved.game, savedAt: saved.savedAt, storageEnabled: true })
          notify('Последнее сохранение загружено.', 'success')
        }
      } catch (error) {
        set({ storageEnabled: false })
        notify(`Не удалось загрузить: ${errorMessage(error)} Текущая компания не изменена.`, 'error')
      } finally {
        set({ ready: true })
      }
    },
    reset: async () => {
      set({ ready: false })
      await saveQueue
      set({ game: createInitialGame(), selectedId: 'garage', savedAt: null, storageEnabled: true, ready: true })
      await get().persist()
      notify('Новая компания создана. Всё начинается с гаража.', 'success')
    },
    dismissNotice: () => set({ notice: null }),
    buyDataLot: (quality) => apply(buyDataLot(get().game, quality), 'Партия данных добавлена в очередь.'),
    startTraining: () => apply(startTraining(get().game), 'Данные загружаются в модель.'),
    setPersonality: (personality) => mutate((game) => ({ ...game, model: { ...game.model, personality } })),
    runBenchmark: () => apply(runBenchmark(get().game, Math.random)),
    togglePreparing: () => apply(togglePreparing(get().game)),
    acceptContract: (variant) => apply(acceptContract(get().game, variant)),
    declineContract: () => mutate((game) => declineContract(game)),
    hireEmployee: (role) => apply(hireEmployee(get().game, role), 'Сотрудник нанят.'),
    fireEmployee: (id) => apply(fireEmployee(get().game, id), 'Сотрудник уволился с расчётом.'),
    toggleOverwork: () => apply(toggleOverwork(get().game)),
    toggleAdvertising: () => mutate((game) => ({ ...game, market: { ...game.market, advertising: !game.market.advertising } })),
    setTokenPrice: (percent) => mutate((game) => ({
      ...game,
      market: { ...game.market, tokenPrice: Math.min(TOKEN_PRICE_MAX, Math.max(TOKEN_PRICE_MIN, Math.round(percent))) },
    })),
    toggleInsurance: () => mutate((game) => ({ ...game, market: { ...game.market, insurance: !game.market.insurance } })),
    toggleLicense: () => mutate((game) => ({ ...game, model: { ...game.model, licensed: !game.model.licensed } })),
    chooseOpenSource: (open) => mutate((game) => ({
      ...changeReputation(
        { ...game, model: { ...game.model, openSource: open, openSourceChosen: true } },
        open ? 15 : 0,
      ),
    }), open ? 'Код открыт: сообщество аплодирует, доход с токенов снизился.' : 'Модель остаётся закрытой.'),
    unlockTech: (id) => mutate((game) => unlockTech(game, id), 'Технология внедрена.'),
    attemptEspionage: () => apply(attemptEspionage(get().game, Math.random)),
    unlockRegion: (regionId) => apply(unlockRegion(get().game, regionId), 'Регион открыт: площадки доступны для покупки.'),
    acceptAcquisition: () => mutate((game) => acceptAcquisition(game)),
    declineAcquisition: () => mutate((game) => ({ ...game, acquisitionDeclined: true })),
  }
})

// Dev-only console hook for GUI tests and screenshots; stripped from production builds.
if (import.meta.env.DEV) {
  (window as unknown as { __neuron?: typeof useGameStore }).__neuron = useGameStore
}
