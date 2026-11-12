import "server-only";

import * as app from "@/app/(app)/actions";
import * as cards from "@/app/(app)/cards/actions";
import * as connect from "@/app/(app)/connect/actions";
import * as couple from "@/app/(app)/couple-actions";
import * as plan from "@/app/(app)/couple/plan-actions";

type Runner = (form: FormData, args: unknown[]) => Promise<unknown>;

// Adapters for the shapes the web uses: useActionState (state, form), <form action> (form)
// and direct calls (no input, or a single id).
const state = (fn: (s: undefined, f: FormData) => Promise<unknown>): Runner => (form) => fn(undefined, form);
const form = (fn: (f: FormData) => Promise<unknown>): Runner => (f) => fn(f);
const none = (fn: () => Promise<unknown>): Runner => () => fn();
const id = (fn: (value: string) => Promise<unknown>): Runner => (_, args) => fn(String(args[0] ?? ""));

/** Every server action the app can call, by name. Sign-in and sign-up run on the device with Supabase. */
export const MOBILE_ACTIONS = {
  // Movimentações, contas futuras, assinaturas, ajustes
  createTransaction: state(app.createTransactionAction),
  updateTransaction: state(app.updateTransactionAction),
  deleteTransaction: form(app.deleteTransactionAction),
  createBill: state(app.createBillAction),
  payBill: form(app.payBillAction),
  cancelBill: form(app.cancelBillAction),
  createSubscription: state(app.createSubscriptionAction),
  subscriptionStatus: form(app.subscriptionStatusAction),
  detectSubscriptions: none(app.detectSubscriptionsAction),
  createTag: state(app.createTagAction),
  createRule: state(app.createRuleAction),
  deleteRule: form(app.deleteRuleAction),
  createManualAccount: state(app.createManualAccountAction),
  archiveAccount: form(app.archiveAccountAction),
  pluggySync: state(app.pluggySyncAction),
  whatsappCode: none(app.whatsappCodeAction),
  whatsappUnlink: none(app.whatsappUnlinkAction),
  // Casal e privacidade
  createInvite: none(couple.createInviteAction),
  joinHousehold: state(couple.joinHouseholdAction),
  leaveHousehold: none(couple.leaveHouseholdAction),
  updateMember: state(couple.updateMemberAction),
  decideProposal: form(couple.decideProposalAction),
  proposeSplit: form(couple.proposeSplitAction),
  setVisibility: form(couple.setVisibilityAction),
  setPartnerCard: form(couple.setPartnerCardAction),
  txPrivacy: form(couple.txPrivacyAction),
  surprise: state(couple.surpriseAction),
  clearSurprise: form(couple.clearSurpriseAction),
  createPrivacyRule: state(couple.createPrivacyRuleAction),
  deletePrivacyRule: form(couple.deletePrivacyRuleAction),
  // Orçamento, metas, combinados, dinheiro livre, retrospectiva
  proposeBudget: state(plan.proposeBudgetAction),
  toggleBudgetAlerts: form(plan.toggleBudgetAlertsAction),
  createGoal: state(plan.createGoalAction),
  confirmGoal: form(plan.confirmGoalAction),
  contribute: state(plan.contributeAction),
  proposeThreshold: state(plan.proposeThresholdAction),
  requestApproval: state(plan.requestApprovalAction),
  respondApproval: form(plan.respondApprovalAction),
  markTalked: form(plan.markTalkedAction),
  withdrawApproval: form(plan.withdrawApprovalAction),
  proposeFreeMoney: state(plan.proposeFreeMoneyAction),
  markRetroPoint: form(plan.markRetroPointAction),
  finishRetro: form(plan.finishRetroAction),
  settleMonth: form(plan.settleMonthAction),
  // Cartões
  cycleOwner: form(cards.cycleOwnerAction),
  batchOwner: state(cards.batchOwnerAction),
  settleInvoice: form(cards.settleInvoiceAction),
  // Conexão com bancos
  connectToken: none(connect.connectTokenAction),
  stageConnection: id(connect.stageConnectionAction),
  stageExisting: none(connect.stageExistingAction),
  setImport: form(connect.setImportAction),
  importConnection: id(connect.importConnectionAction),
  disconnect: form(connect.disconnectAction),
} satisfies Record<string, Runner>;
