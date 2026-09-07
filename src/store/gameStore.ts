import { sellCompanyServer, overclockCompanyServer, deployCompanyReserve } from '../systems/models'
import type { AnyLocationId, GridPosition, ChassisId } from '../systems/types'
import { create } from 'zustand'
import { BALANCE_VERSION, TOKEN_PRICE_MAX, TOKEN_PRICE_MIN } from '../systems/config'
import {
  acceptCompanyAcquisition,
  acceptCompanyContract,
  advanceCompanySimulation,
  allocateCompute,
  applyModel,
  benchmarkModel,
  buyCompanyLocation,
  buyCompanyOffice,
  buyCompanyTower,
  buyModelData,
  companyView,
  createCompanyGame,
  declineCompanyContract,
  fireCompanyEmployee,
  hireCompanyEmployee,
  mergeCompany,
  mountCompanyChassis,
  mountCompanyChip,
  orderCompanyEquipment,
  orderCompanyServerKit,
  purchaseBaseModel,
  renameModel,
  setModelPersonality,
  setQuantization,
  startModelTraining,
  toggleCompanyOverwork,
  toggleModelLicensing,
  toggleModelPreparing,
  unlockCompanyRegion,
  unlockModelTech,
} from '../systems/models'
import type { BaseModelId, CompanyActionResult, CompanyState, DataDomain, ModelId, QuantizationStep, Strategy } from '../systems/models'
import { type CityTowerId } from '../systems/city'
import { attemptEspionage } from '../systems/competitor'
import { changeReputation } from '../systems/reputation'
import type { ActionResult, ChipId, ContractKind, DataQuality, GameSpeed, GameState, LocationId, Personality, RegionLocationId, TechNodeId } from '../systems/types'
import type { OrderRequest } from '../systems/procurement'
import { loadCompanyGame, saveCompanyGame } from '../persistence/companySaves'

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

export interface EventLogItem {
  id: number
  message: string
  kind: Notice['kind']
  atHours: number
}

export type SessionPhase = 'menu' | 'setup' | 'playing'

interface GameStore {
  company: CompanyState
  game: GameState
  phase: SessionPhase
  hasSave: boolean
  selectedId: LocationId
  selectedModelId: ModelId
  ready: boolean
  saving: boolean
  storageEnabled: boolean
  savedAt: string | null
  notice: Notice | null
  eventLog: EventLogItem[]
  procurement: ProcurementRequest | null
  initialize: () => Promise<void>
  continueGame: () => Promise<void>
  beginSetup: () => void
  cancelSetup: () => void
  startNewGame: (strategy: Strategy, modelName: string) => Promise<void>
  selectLocation: (id: LocationId) => void
  selectModel: (id: ModelId) => void
  sellAt: (id: AnyLocationId, serverId: string) => void
  overclockAt: (id: AnyLocationId, serverId: string, value: number) => void
  deployReserve: (id: AnyLocationId, serverId: string, position: GridPosition) => void
  purchaseOffice: () => void
  purchaseCityTower: (id: CityTowerId) => void
  purchaseLocation: (id: LocationId | RegionLocationId) => void
  openProcurement: (request: { locationId: AnyLocationId; position: GridPosition | null; serverId?: string | null }) => void
  closeProcurement: () => void
  orderEquipment: (request: OrderRequest) => void
  orderKit: (request: Parameters<typeof orderCompanyServerKit>[1]) => void
  mountChip: (id: AnyLocationId, position: GridPosition, chip: ChipId) => void
  mountChassis: (id: AnyLocationId, position?: GridPosition, chassis?: ChassisId) => void
  tick: (seconds: number) => void
  togglePause: () => void
  setSpeed: (speed: GameSpeed) => void
  persist: (manual?: boolean) => Promise<void>
  restore: () => Promise<void>
  reset: () => Promise<void>
  dismissNotice: () => void
  buyDataLot: (quality: DataQuality, domain?: DataDomain) => void
  startTraining: () => void
  setPersonality: (personality: Personality) => void
  runBenchmark: () => void
  togglePreparing: () => void
  acceptContract: (variant: ContractKind, modelId?: ModelId) => void
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
  renameSelected: (name: string) => void
  purchaseBase: (baseId: BaseModelId, name: string, replace?: boolean) => void
  setModelQuantization: (id: ModelId, step: QuantizationStep) => void
  setAllocations: (allocations: Readonly<Record<string, number>>) => void
}

let boot: Promise<void> | null = null
let saveQueue: Promise<void> = Promise.resolve()
let noticeSequence = 0

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Хранилище браузера недоступно.'
}

function snapshot(company: CompanyState, selectedModelId?: ModelId) {
  const selected = selectedModelId && company.models.some((model) => model.id === selectedModelId)
    ? selectedModelId
    : company.models[0].id
  return { company, game: companyView(company), selectedModelId: selected }
}

export const useGameStore = create<GameStore>((set, get) => {
  const remember = (message: string, kind: Notice['kind'], company: CompanyState) => {
    const item: EventLogItem = { id: ++noticeSequence, message, kind, atHours: company.company.elapsedGameHours }
    set({
      notice: { message, kind, id: item.id },
      eventLog: [...get().eventLog, item].slice(-40),
    })
  }

  const notify = (message: string, kind: Notice['kind'] = 'info') => remember(message, kind, get().company)

  const apply = (result: CompanyActionResult, success?: string) => {
    if (!get().ready) return
    if (!result.ok) return notify(result.error, 'error')
    set(snapshot(result.state, get().selectedModelId))
    if (success) remember(success, 'success', result.state)
  }

  const shared = (action: (view: GameState) => ActionResult | GameState, success?: string) => {
    const company = get().company
    const view = companyView(company)
    const result = action(view)
    if (result && typeof result === 'object' && 'ok' in result) {
      if (!result.ok) return notify(result.error, 'error')
      apply({ ok: true, state: mergeCompany(company, result.state) }, success)
      return
    }
    apply({ ok: true, state: mergeCompany(company, result) }, success)
  }

  const blank = createCompanyGame()

  return {
    company: blank,
    game: companyView(blank),
    phase: 'menu',
    hasSave: false,
    selectedId: 'garage',
    selectedModelId: blank.models[0].id,
    ready: false,
    saving: false,
    storageEnabled: true,
    savedAt: null,
    notice: null,
    eventLog: [],
    procurement: null,
    initialize: () => {
      if (!boot) {
        boot = (async () => {
          try {
            const saved = await loadCompanyGame()
            if (saved) {
              set({
                ...snapshot(saved.game),
                savedAt: saved.savedAt,
                hasSave: true,
                phase: 'menu',
              })
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
    continueGame: async () => {
      if (get().hasSave) {
        set({ phase: 'playing' })
        return
      }
      await get().restore()
      if (get().hasSave) set({ phase: 'playing' })
    },
    beginSetup: () => set({ phase: 'setup' }),
    cancelSetup: () => set({ phase: 'menu' }),
    startNewGame: async (strategy, modelName) => {
      const name = modelName.trim()
      if (!name) {
        notify('Введите название модели.', 'error')
        return
      }
      let company = createCompanyGame(strategy)
      const renamed = renameModel(company, company.models[0].id, name)
      if (!renamed.ok) {
        notify(renamed.error, 'error')
        return
      }
      company = renamed.state
      set({
        ...snapshot(company),
        selectedId: 'garage',
        phase: 'playing',
        savedAt: null,
        storageEnabled: true,
        ready: true,
        hasSave: true,
        eventLog: [],
      })
      await get().persist()
      notify('Новая компания создана. Всё начинается с гаража.', 'success')
    },
    sellAt: (id, serverId) => apply(sellCompanyServer(get().company, id, serverId), 'Сервер продан. Стойка осталась в ячейке.'),
    overclockAt: (id, serverId, value) => apply(overclockCompanyServer(get().company, id, serverId, value)),
    deployReserve: (id, serverId, position) => apply(deployCompanyReserve(get().company, id, serverId, position), 'Сервер из резерва размещён в комнате.'),
    selectLocation: (selectedId) => set({ selectedId }),
    selectModel: (selectedModelId) => {
      if (get().company.models.some((model) => model.id === selectedModelId)) set({ selectedModelId })
    },
    purchaseOffice: () => apply(buyCompanyOffice(get().company), 'Головной офис куплен. Теперь можно войти.'),
    purchaseCityTower: (id) => apply(buyCompanyTower(get().company, id), 'Здание куплено. Арендаторы приносят доход каждый игровой час.'),
    purchaseLocation: (id) => apply(buyCompanyLocation(get().company, id), 'Локация приобретена. Закажите шасси в серверной комнате.'),
    openProcurement: (request) => set({ procurement: request }),
    closeProcurement: () => set({ procurement: null }),
    orderEquipment: (request) => apply(orderCompanyEquipment(get().company, request), 'Заказ оплачен. Оборудование в пути.'),
    orderKit: (request) => apply(orderCompanyServerKit(get().company, request), 'Комплект оплачен. Шасси и чип в пути.'),
    mountChip: (id, position, chip) => apply(mountCompanyChip(get().company, id, position, chip)),
    mountChassis: (id, position, chassis) => apply(mountCompanyChassis(get().company, id, position, chassis)),
    tick: (seconds) => {
      const state = get()
      if (!state.ready || state.phase !== 'playing') return
      const company = advanceCompanySimulation(state.company, seconds)
      if (company.company.pendingNotices.length > 0) {
        const [first, ...rest] = company.company.pendingNotices
        const next = { ...company, company: { ...company.company, pendingNotices: rest } }
        set(snapshot(next, state.selectedModelId))
        remember(first, 'info', next)
      } else {
        set(snapshot(company, state.selectedModelId))
      }
    },
    togglePause: () => {
      const company = get().company
      set(snapshot({ ...company, company: { ...company.company, paused: !company.company.paused } }, get().selectedModelId))
    },
    setSpeed: (speed) => {
      const company = get().company
      set(snapshot({ ...company, company: { ...company.company, speed } }, get().selectedModelId))
    },
    persist: (manual = false) => {
      const { company, ready, storageEnabled, phase } = get()
      if (!ready || !storageEnabled || phase !== 'playing') {
        if (manual) notify('Сохранение недоступно. Повторите загрузку или создайте новую компанию с подтверждением.', 'error')
        return Promise.resolve()
      }
      const operation = saveQueue.then(async () => {
        set({ saving: true })
        try {
          const savedAt = await saveCompanyGame(company)
          set({ savedAt, hasSave: true })
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
        const saved = await loadCompanyGame()
        if (!saved) {
          notify('Сохранения пока нет. Сначала сохраните компанию.')
          set({ hasSave: false })
        } else {
          set({
            ...snapshot(saved.game),
            savedAt: saved.savedAt,
            storageEnabled: true,
            hasSave: true,
            phase: 'playing',
          })
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
      set({ phase: 'setup' })
    },
    dismissNotice: () => set({ notice: null }),
    buyDataLot: (quality, domain = 'general') => apply(buyModelData(get().company, get().selectedModelId, quality, domain), 'Партия данных добавлена в очередь.'),
    startTraining: () => apply(startModelTraining(get().company, get().selectedModelId), 'Данные загружаются в модель.'),
    setPersonality: (personality) => apply(setModelPersonality(get().company, get().selectedModelId, personality)),
    runBenchmark: () => apply(benchmarkModel(get().company, get().selectedModelId, Math.random)),
    togglePreparing: () => apply(toggleModelPreparing(get().company, get().selectedModelId)),
    acceptContract: (variant, modelId) => apply(acceptCompanyContract(
      get().company,
      variant,
      variant === 'official' ? (modelId ?? get().selectedModelId) : undefined,
    )),
    declineContract: () => apply(declineCompanyContract(get().company)),
    hireEmployee: (role) => apply(hireCompanyEmployee(get().company, role), 'Сотрудник нанят.'),
    fireEmployee: (id) => apply(fireCompanyEmployee(get().company, id), 'Сотрудник уволился с расчётом.'),
    toggleOverwork: () => apply(toggleCompanyOverwork(get().company)),
    toggleAdvertising: () => shared((view) => ({ ok: true, state: { ...view, market: { ...view.market, advertising: !view.market.advertising } } })),
    setTokenPrice: (percent) => shared((view) => ({
      ok: true,
      state: {
        ...view,
        market: { ...view.market, tokenPrice: Math.min(TOKEN_PRICE_MAX, Math.max(TOKEN_PRICE_MIN, Math.round(percent))) },
      },
    })),
    toggleInsurance: () => shared((view) => ({ ok: true, state: { ...view, market: { ...view.market, insurance: !view.market.insurance } } })),
    toggleLicense: () => apply(toggleModelLicensing(get().company, get().selectedModelId)),
    chooseOpenSource: (open) => apply(applyModel(get().company, get().selectedModelId, (view) => ({
      ok: true,
      state: changeReputation(
        { ...view, model: { ...view.model, openSource: open, openSourceChosen: true } },
        open ? 15 : 0,
      ),
    })), open ? 'Код открыт: сообщество аплодирует, доход с токенов снизился.' : 'Модель остаётся закрытой.'),
    unlockTech: (id) => apply(unlockModelTech(get().company, get().selectedModelId, id), 'Технология внедрена.'),
    attemptEspionage: () => shared((view) => attemptEspionage(view, Math.random)),
    unlockRegion: (regionId) => apply(unlockCompanyRegion(get().company, regionId), 'Регион открыт: площадки доступны для покупки.'),
    acceptAcquisition: () => apply(acceptCompanyAcquisition(get().company)),
    declineAcquisition: () => {
      const company = get().company
      apply({ ok: true, state: { ...company, company: { ...company.company, acquisitionDeclined: true } } })
    },
    renameSelected: (name) => apply(renameModel(get().company, get().selectedModelId, name), 'Название модели обновлено.'),
    purchaseBase: (baseId, name, replace = false) => {
      const company = get().company
      const replacement = replace && company.strategy === 'flagship'
        ? { modelId: company.models[0].id, confirm: true as const }
        : undefined
      const result = purchaseBaseModel(company, baseId, replacement, name)
      apply(result, company.strategy === 'flagship' ? 'Флагман заменён. Прогресс старой модели не перенесён.' : 'Базовая модель добавлена в портфель.')
      if (result.ok) {
        const added = result.state.models[result.state.models.length - 1]
        set({ selectedModelId: added.id })
      }
    },
    setModelQuantization: (id, step) => apply(setQuantization(get().company, id, step), 'Квантование изменено. Действие обратимо.'),
    setAllocations: (allocations) => apply(allocateCompute(get().company, allocations)),
  }
})

if (import.meta.env.DEV) {
  (window as unknown as { __neuron?: typeof useGameStore }).__neuron = useGameStore
}
