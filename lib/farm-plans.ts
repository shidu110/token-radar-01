import type { SnapshotProtocol } from './snapshot.ts';

export const GAS_USD: Record<string, [number, number]> = {
  Ethereum: [8, 35],
  Arbitrum: [0.10, 1],
  Base: [0.05, 0.50],
  Optimism: [0.10, 1],
  Polygon: [0.02, 0.30],
  Solana: [0.01, 0.20],
  Sui: [0.02, 0.30],
  Avalanche: [0.10, 1],
  Binance: [0.10, 1],
  'Hyperliquid L1': [0, 0.20],
  Bitcoin: [1, 8],
  Tron: [1, 5],
  Starknet: [0.10, 1],
  Linea: [0.10, 1],
  Scroll: [0.10, 1],
  'zkSync Era': [0.10, 1],
};
export const DEFAULT_GAS_USD: [number, number] = [0.25, 3];

interface Playbook {
  enter: string;
  maintain: string;
  risk: string;
}

const PLAYBOOKS: Record<string, Playbook> = {
  Lending: {
    enter: 'Supply an available stable asset to a liquid lending market; record the receipt and avoid borrowing initially',
    maintain: 'Review utilization and supply APR, then test withdrawing 10% of the deposit; do not borrow merely to add activity',
    risk: 'Inspect oracle sources, collateral caps and smart-contract audits; withdraw if exit liquidity falls or the supplied asset depegs',
  },
  Dexs: {
    enter: 'Make a small spot swap, then add balanced liquidity to a deep pair only if both assets fit your risk budget',
    maintain: 'Inspect volume and fee accrual, rebalance only when needed, and avoid wash trades or unnecessary turnover',
    risk: 'Compare pool reserves and exit slippage; remove liquidity if a pool thins, an asset depegs or impermanent loss exceeds your budget',
  },
  Derivatives: {
    enter: 'Deposit margin and test one small fully collateralized hedge at 1x maximum exposure; record entry and liquidation prices',
    maintain: 'Inspect funding and margin, close the test hedge once, and avoid repeated trades solely for speculative points',
    risk: 'Check oracle deviations, liquidation buffers and withdrawal queues; close exposure if funding or liquidity makes the hedge unsafe',
  },
  CDP: {
    enter: 'Deposit supported collateral and mint a small stablecoin amount at no more than 25% loan-to-value; save the debt receipt',
    maintain: 'Check collateralization and the stablecoin price, reserve repayment funds, and test repaying 10% of the debt',
    risk: 'Inspect liquidation thresholds and oracle design; repay debt before removing collateral if the peg breaks or the safety buffer falls',
  },
  Yield: {
    enter: 'Deposit into a supported unlevered yield vault only after reading its strategy, lockup and withdrawal terms',
    maintain: 'Compare realized yield with fees, record vault shares, and test a partial redemption rather than blindly compounding',
    risk: 'Inspect strategy dependencies and smart-contract audits; request redemption if the receipt depegs or withdrawal liquidity deteriorates',
  },
  'Basis Trading': {
    enter: 'Test a small supported delta-neutral vault; verify its spot hedge, short exposure and redemption terms before depositing',
    maintain: 'Review net funding after fees and hedge balance, and keep a cash reserve rather than increasing exposure on headline yield',
    risk: 'Check funding reversals, hedge counterparty exposure and receipt depeg risk; redeem if the strategy loses neutrality or exit liquidity',
  },
  'Risk Curators': {
    enter: 'Choose one curated vault, read its collateral mandates and allocation caps, and deposit only after checking its withdrawal path',
    maintain: 'Review curator allocation changes and utilization, record share value, and test a small withdrawal to verify available liquidity',
    risk: 'Inspect curator permissions, oracle dependencies and smart-contract audits; exit if mandates change or a concentrated market loses liquidity',
  },
  fallback: {
    enter: 'Read product eligibility and supported assets; test the smallest documented deposit or purchase only if a reversible exit is available',
    maintain: 'Use one documented core feature, record its receipt and fees, and test an exit; skip features that require leverage or unclear custody',
    risk: 'Inspect smart-contract audits, custody and redemption conditions; unwind if asset backing, price stability or withdrawal liquidity deteriorates',
  },
};

export function farmTier(tvl: number): { label: string; capital: number; weeks: number } {
  if (tvl >= 1_000_000_000) return { label: 'large-TVL', capital: 250, weeks: 4 };
  if (tvl >= 50_000_000) return { label: 'mid-TVL', capital: 100, weeks: 6 };
  return { label: 'small-TVL', capital: 50, weeks: 8 };
}

export function farmSteps(protocol: SnapshotProtocol): string[] {
  const chain = protocol.chains[0] ?? 'the listed network';
  const category = protocol.category ?? 'Uncategorized';
  const tier = farmTier(protocol.tvl_usd);
  const book = PLAYBOOKS[category] ?? (category.includes('Lending') ? PLAYBOOKS.Lending
    : category.includes('Yield') ? PLAYBOOKS.Yield : PLAYBOOKS.fallback)!;
  const gas = GAS_USD[chain] ?? DEFAULT_GAS_USD;
  const dollars = (amount: number) => amount.toFixed(2).replace(/\.00$/, '');
  const gasRange = `$${dollars(gas[0])}-$${dollars(gas[1])}`;
  const context = `${protocol.name} on ${chain} (${category}, ${tier.label})`;
  const steps = [
    `For ${context}, verify the official app and contract addresses against its documentation; use a limited-balance wallet and fund native gas. Cost: $${tier.capital} capital budget plus ${gasRange} gas per transaction. Time: 15 minutes for setup.`,
    `At ${context}: ${book.enter}. Cost: $${tier.capital} at-risk capital plus ${gasRange} gas per transaction; check quoted fees before signing. Time: 20 minutes for one session.`,
    `At ${context}: ${book.maintain}. Cost: keep $${tier.capital} capital exposed, plus ${gasRange} gas per transaction and any quoted fees. Time: 10 minutes per session, once weekly for ${tier.weeks} weeks.`,
    `For ${context}, track the token-launch signal: read its governance forum, points program or snapshot announcement if published; log dated eligibility rules and verify claim contracts. Cost: $0 to read; ${gasRange} gas only for a verified claim. Time: 10 minutes weekly for ${tier.weeks} weeks.`,
    `At ${context}: ${book.risk}. Cost: ${gasRange} exit gas per transaction; the $${tier.capital} capital can be lost, and slippage or fees may add cost. Time: 15 minutes weekly and before every exit.`,
  ];
  for (const step of steps) if (step.length < 120 || step.length > 400) throw new Error(`Farm step length ${step.length} at ${protocol.slug}`);
  return steps;
}
