// Public systems API for the future strategy/marketplace/portfolio UI.
// No React, renderer, browser clock or storage dependency belongs in this module.
export * from './types'
export * from './config'
export { createCompanyGame, migrateSingleModel, changeStrategy, getModel, companyLearnedIQ, companyUsers, companyGmi, benchmarkIsCurrent, companyView, applyModel, mergeCompany, modelView, withModel } from './state'
export * from './commands'
export * from './economy'
export { advanceCompanySimulation, processCompanyDay } from './simulation'
