export type LocationId = 'garage' | 'workshop' | 'technopark' | 'server-hall' | 'campus' | 'dc-north' | 'dc-south'
export type RegionLocationId = 'overseas-west' | 'overseas-east'
export type AnyLocationId = LocationId | RegionLocationId
export type GameSpeed = 1 | 3
export type Rng = () => number

export interface GridSize { rows: number; cols: number }
export interface GridPosition { row: number; col: number }
export type ChassisId = 'rack-basic' | 'rack-cooled' | 'rack-enterprise'
export type Channel = 'official' | 'grey'

export interface ChassisDefinition {
  id: ChassisId
  name: string
  price: number
  chips: ChipId[]
  failRiskMult: number
  computeMult: number
  delivery: Record<Channel, number>
}

export interface InstalledServer {
  chassis?: ChassisId
  id: string
  chip: ChipId
  overclock: number
  gridPosition: GridPosition | null
}

export interface LocationDefinition {
  gridSize: GridSize
  id: LocationId
  name: string
  district: string
  description: string
  price: number
  powerLimitKw: number
  rentPerHour: number
  polygon: number[]
  center: { x: number; y: number }
}

export interface RegionLocationDefinition {
  gridSize: GridSize
  id: RegionLocationId
  name: string
  description: string
  price: number
  powerLimitKw: number
  rentPerHour: number
}

export interface RegionDefinition {
  id: string
  name: string
  description: string
  unlockCost: number
  electricityMult: number
  courtRiskMult: number
  locations: RegionLocationDefinition[]
}

export type ChipId = 'consumer-gpu' | 'pro-gpu' | 'accelerator' | 'flagship'

export interface ServerDefinition {
  id: ChipId
  name: string
  price: number
  powerKw: number
  maintenancePerHour: number
  compute: number
  resaleRatio: number
}

export interface ChipRack {
  chip: ChipId
  count: number
}

export interface ChassisRig {
  id: string
  chassis: ChassisId
  gridPosition: GridPosition
}

export interface LocationInventory {
  chips: Partial<Record<ChipId, number>>
  chassis: Partial<Record<ChassisId, number>>
  greyChips?: Partial<Record<ChipId, number>>
  greyChassis?: Partial<Record<ChassisId, number>>
}

export interface EquipmentOrder {
  id: number
  locationId: AnyLocationId
  kind: 'chip' | 'chassis'
  item: ChipId | ChassisId
  channel: Channel
  qty: number
  paid: number
  arriveAt: number
  targetCell: GridPosition | null
  targetServerId: string | null
}

export interface LocationState {
  gridSize?: GridSize
  installedServers?: InstalledServer[]
  serverSeq?: number
  id: AnyLocationId
  owned: boolean
  servers: number
  racks?: ChipRack[]
  rigs?: ChassisRig[]
  inventory?: LocationInventory
}

export interface Milestones {
  boughtLocation: boolean
  installedServer: boolean
  earnedRevenue: boolean
  experiencedThrottle: boolean
}

export type DataQuality = 'official' | 'unofficial'

export interface DataLot {
  id: number
  quality: DataQuality
  volume: number
}

export type Personality = 'friendly' | 'raw'
export type TechNodeId = 'context' | 'multimodal' | 'voice'

export interface TrainingRun {
  total: number
  remaining: number
  poisonedChance: number
  usedUnofficial: boolean
}

export interface GmiResult {
  reasoning: number
  coding: number
  safety: number
  multimodal: number
  total: number
  cheated: boolean
  exposed: boolean
  day: number
}

export type ContractKind = 'official' | 'grey' | 'enterprise'

export interface ContractOffer {
  id: number
  clientName: string
  officialPayout: number
  greyPayout: number
  enterprise: boolean
  enterprisePayout: number
  expiresDay: number
}

export interface ActiveContract {
  kind: ContractKind
  clientName: string
  payout: number
  requiresOfficialData: boolean
  noCheatUntilDay: number | null
  dirtyUntilDay: number | null
  fulfilled: boolean | null
}

export interface ModelState {
  iq: number
  queue: DataLot[]
  run: TrainingRun | null
  infected: boolean
  offlineUntil: number | null
  personality: Personality | null
  openSource: boolean
  openSourceChosen: boolean
  tech: TechNodeId[]
  licensed: boolean
  dirtyHistory: boolean
}

export interface BenchmarkState {
  preparing: boolean
  testing: boolean
  last: GmiResult | null
  adBoostUntil: number | null
}

export interface ContractsState {
  seq: number
  pending: ContractOffer | null
  nextOfferDay: number
  active: ActiveContract | null
}

export interface CompetitorState {
  score: number
  samples: number[]
  revealedUntil: number | null
  nextAmbientDay: number
}

export type EmployeeRole = 'safety' | 'engineer'

export interface Employee {
  id: number
  role: EmployeeRole
  salaryPerHour: number
  hiredDay: number
}

export interface TeamState {
  seq: number
  employees: Employee[]
  morale: number
  overwork: boolean
}

export interface ChipPriceState {
  price: number
  trend: 1 | 0 | -1
}

export interface MarketState {
  chips: Record<ChipId, ChipPriceState>
  advertising: boolean
  tokenPrice: number
  insurance: boolean
  viralUntil: number | null
  ambientBoostUntil: number | null
  ambientPenaltyUntil: number | null
  dirtyRiskUntil: number | null
}

export interface InvestorsState {
  nextCheckDay: number
  restrictedUntil: number | null
  misses: number
}

export interface GameState {
  rareCarUntil?: number
  officeOwned?: boolean
  cash: number
  cityProperties?: import('./city').CityTowerId[]
  orders: EquipmentOrder[]
  orderSeq: number
  elapsedGameHours: number
  speed: GameSpeed
  paused: boolean
  locations: LocationState[]
  regionLocations: LocationState[]
  regions: string[]
  totalRevenue: number
  totalExpenses: number
  totalCapex: number
  milestones: Milestones
  users: number
  reputation: number
  model: ModelState
  benchmark: BenchmarkState
  contracts: ContractsState
  competitor: CompetitorState
  team: TeamState
  market: MarketState
  investors: InvestorsState
  dataLotSeq: number
  ending: 'acquired' | null
  acquisitionOffered: boolean
  acquisitionDeclined: boolean
  pendingNotices: string[]
}

export interface LocationEconomy {
  demandKw: number
  suppliedKw: number
  efficiency: number
  effectiveCompute: number
  revenuePerHour: number
  electricityPerHour: number
  maintenancePerHour: number
  rentPerHour: number
  expensesPerHour: number
  profitPerHour: number
}

export interface CompanyEconomy {
  serverRevenuePerHour: number
  propertyRevenuePerHour: number
  propertyExpensesPerHour: number
  salariesPerHour: number
  revenuePerHour: number
  electricityPerHour: number
  maintenancePerHour: number
  rentPerHour: number
  expensesPerHour: number
  profitPerHour: number
  demandKw: number
  suppliedKw: number
  capacityKw: number
  effectiveCompute: number
  serverCount: number
  ownedCount: number
}

export type ActionResult =
  | { ok: true; state: GameState }
  | { ok: false; error: string }
