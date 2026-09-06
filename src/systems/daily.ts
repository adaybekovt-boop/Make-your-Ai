import { dailyAmbientGmi, dailyCompetitorStep } from './competitor'
import { clearExpiredOffer, closeCompletedContract, maybeGenerateOffer } from './contracts'
import { dailyExposureRoll } from './benchmark'
import {
  dailyComplaintRoll,
  dailyCourtRoll,
  dailyPromptInjectionRoll,
  dailyRandomEvent,
} from './events'
import {
  dailyAdvertisingBilling,
  dailyChipMarket,
  dailyInsuranceBilling,
  dailyInvestors,
  dailyLicensingPayout,
  dailyUserStep,
  maybeOfferAcquisition,
  userCapacity,
} from './market'
import { calculateCompanyEconomy } from './economy'
import { dailyMoraleStep } from './team'
import { dailyEquipmentFailures } from './equipment'
import { dailyMalwareRoll } from './training'
import type { GameState, Rng } from './types'

/**
 * Everything that happens once per in-game day, in a fixed order.
 * Runs on the day boundary inside advanceSimulation; rng is injectable for tests.
 */
export function processDailySystems(state: GameState, rng: Rng): GameState {
  const economy = calculateCompanyEconomy(state)
  let next = state

  next = dailyChipMarket(next, rng)

  const capacity = userCapacity(next, economy)
  next = { ...next, users: Math.max(0, dailyUserStep(next, capacity)) }

  next = dailyCompetitorStep(next, rng)
  next = dailyAmbientGmi(next, rng)

  next = closeCompletedContract(next)
  next = clearExpiredOffer(next)
  next = maybeGenerateOffer(next, rng)

  next = dailyMalwareRoll(next, rng)
  next = dailyExposureRoll(next, rng)
  next = dailyPromptInjectionRoll(next, rng)
  next = dailyCourtRoll(next, rng)
  next = dailyComplaintRoll(next, rng)
  next = dailyRandomEvent(next, rng)
  next = dailyEquipmentFailures(next, rng)

  next = dailyMoraleStep(next, rng)

  next = dailyInsuranceBilling(next)
  next = dailyAdvertisingBilling(next)
  next = dailyLicensingPayout(next)

  next = dailyInvestors(next, calculateCompanyEconomy(next), rng)
  next = maybeOfferAcquisition(next)

  return next
}
