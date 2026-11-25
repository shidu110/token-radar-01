import type { SnapshotProtocol } from './snapshot.ts';

export const GAS_USD: Record<string, [number, number]> = {
  Ethereum: [8, 35],
  Arbitrum: [0.10, 0.80],
  Base: [0.10, 0.80],
  Optimism: [0.10, 0.80],
  zkSync: [0.10, 0.80],
  'zkSync Era': [0.10, 0.80],
  Linea: [0.10, 0.80],
  Scroll: [0.10, 0.80],
  Blast: [0.10, 0.80],
  Mantle: [0.10, 0.80],
  BSC: [0.20, 1],
  Binance: [0.20, 1],
  Polygon: [0.01, 0.10],
  Solana: [0.01, 0.05],
  Sui: [0.01, 0.05],
  Aptos: [0.01, 0.05],
  Tron: [0.50, 2],
};
export const DEFAULT_GAS_USD: [number, number] = [0.50, 5];

interface Playbook {
  enter: string;
  maintain: string;
  risk: string;
}

const PLAYBOOKS: Record<string, Playbook> = {
  Lending: {
    enter: 'Supply an available stable asset to a liquid lending market; record the supply receipt and borrow limits without borrowing initially',
    maintain: 'Review utilization and supply APR, then test withdrawing 10% of the deposit; do not borrow merely to add activity',
    risk: 'Inspect oracle sources, collateral caps and smart-contract audits; withdraw if exit liquidity falls or the supplied asset depegs',
  },
  Dexs: {
    enter: 'Make a small spot swap, then open a balanced liquidity-provider (LP) position in a deep pair only if both assets fit your risk budget',
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
    enter: 'Make a supported unlevered yield vault deposit only after reading its strategy, lockup and withdrawal terms',
    maintain: 'Compare realized yield with fees, record vault shares, and test a partial redemption rather than blindly compounding',
    risk: 'Inspect strategy dependencies and smart-contract audits; request redemption if the receipt depegs or withdrawal liquidity deteriorates',
  },
  'Basis Trading': {
    enter: 'Test a small supported delta-neutral vault; verify its spot hedge, short exposure and redemption terms before depositing',
    maintain: 'Review net funding after fees and hedge balance, and keep a cash reserve rather than increasing exposure on headline yield',
    risk: 'Check funding reversals, hedge counterparty exposure and receipt depeg risk; redeem if the strategy loses neutrality or exit liquidity',
  },
  'Risk Curators': {
    enter: 'Choose one curated vault, read its mandates and allocation caps, and make a vault deposit only after checking its withdrawal path',
    maintain: 'Review curator allocation changes and utilization, record share value, and test a small withdrawal to verify available liquidity',
    risk: 'Inspect curator permissions, oracle dependencies and smart-contract audits; exit if mandates change or a concentrated market loses liquidity',
  },
  Restaking: {
    enter: 'Restake a small supported asset only after checking operator selection, slashing exposure and the unbonding period; save the receipt',
    maintain: 'Review operator performance and delegated exposure; test an unbond request rather than adding leverage or looping receipts',
    risk: 'Check slashing conditions and operator concentration; stop restaking if penalties or withdrawal delays exceed the loss budget',
  },
  Bridge: {
    enter: 'Bridge a small supported asset amount, then use the received asset in one documented destination feature; verify the return route',
    maintain: 'Inspect bridge settlement and destination liquidity; test a small return transfer instead of cycling funds for speculative points',
    risk: 'Check bridge custody, validator assumptions and message finality; stop transfers if settlement stalls or the bridged asset depegs',
  },
  Staking: {
    enter: 'Stake a small supported asset after reading validator permissions, reward accounting and unstaking terms; save the delegation receipt',
    maintain: 'Review validator performance and rewards; test a partial unstake without borrowing against the stake or chasing headline APR',
    risk: 'Check slashing, validator concentration and exit queues; request unstaking if custody or unbonding risk exceeds the loss budget',
  },
  'Liquidity Manager': {
    enter: 'Open a small managed LP position after checking pool assets, allocation ranges, management fees and the withdrawal path',
    maintain: 'Review managed LP allocation changes and net fees; test a partial exit instead of funding unnecessary rebalances',
    risk: 'Check manager permissions and pool slippage; remove the LP position if impermanent loss or concentrated liquidity exceeds the budget',
  },
  RWA: {
    enter: 'Check investor eligibility, legal backing and custody; make a small supported real-world-asset purchase only with a documented redemption path',
    maintain: 'Review backing attestations and redemption windows; record the asset receipt and test a partial redemption if permitted',
    risk: 'Inspect issuer concentration, custody and legal restrictions; stop purchases if backing evidence or redemption access deteriorates',
  },
  Insurance: {
    enter: 'Read cover eligibility, exclusions and claims terms; purchase a small supported policy only for exposure you actually hold',
    maintain: 'Review policy expiry and covered exposure; save premium receipts and claims evidence rather than renewing solely for points',
    risk: 'Check insurer capital, exclusions and claim adjudication; stop buying cover if payout conditions or counterparty solvency are unclear',
  },
  Payments: {
    enter: 'Test one small supported payment or transfer after checking recipient details, settlement fees and refund conditions',
    maintain: 'Use the payment feature only for a genuine need; record settlement receipts and confirm recipient access to the funds',
    risk: 'Check custody, settlement finality and refund restrictions; stop payments if funds are delayed or recipient access is uncertain',
  },
  'Prediction Market': {
    enter: 'Read event resolution and jurisdiction rules; test one small fully funded prediction position without leverage',
    maintain: 'Review resolution evidence and market liquidity; test closing part of the position rather than generating artificial volume',
    risk: 'Check dispute procedures and outcome ambiguity; close the prediction position if resolution or exit liquidity is unreliable',
  },
  Chain: {
    enter: 'Fund a small native-gas balance and use one documented chain application; verify its contracts and a reversible asset exit',
    maintain: 'Use the same chain application for a genuine need; save transaction receipts and test withdrawing the application balance',
    risk: 'Check chain finality, sequencer or validator assumptions and application custody; stop activity if settlement or exits fail',
  },
  Privacy: {
    enter: 'Read privacy-pool eligibility and withdrawal rules; test a small supported private transfer while preserving recovery information',
    maintain: 'Record private-transfer receipts securely and test withdrawal access; avoid repeated transfers just to create activity',
    risk: 'Check recovery, custody and compliance restrictions; stop private transfers if recovery or the documented exit is uncertain',
  },
  'Collateral Markets': {
    enter: 'Deposit a small supported collateral position after reading allocation permissions, collateral caps and withdrawal terms',
    maintain: 'Review collateral allocations and utilization; test a partial collateral withdrawal without adding debt merely for activity',
    risk: 'Check collateral custody, oracle design and liquidation exposure; exit if backing or available withdrawal liquidity deteriorates',
  },
  'Governance Incentives': {
    enter: 'Read incentive eligibility and governance lock terms; test a small documented allocation only if its exit fits the loss budget',
    maintain: 'Review governance proposals and incentive accounting; save allocation receipts without buying voting influence solely for points',
    risk: 'Check lock duration, incentive custody and governance permissions; stop allocations if unlock terms or reward accounting are unclear',
  },
  Indexes: {
    enter: 'Purchase a small supported index position after checking constituents, rebalance rules, fees and redemption terms',
    maintain: 'Review index composition and net asset value; test a partial redemption rather than chasing frequent rebalances',
    risk: 'Check index backing, custody and redemption slippage; exit if constituent concentration or receipt discounts exceed the loss budget',
  },
  'OTC Marketplace': {
    enter: 'Read OTC order settlement and counterparty terms; test a small fully funded purchase only if delivery and cancellation are documented',
    maintain: 'Confirm OTC settlement and retain trade receipts; test selling only for a genuine need rather than generating artificial volume',
    risk: 'Check escrow custody, counterparty default and settlement disputes; stop OTC orders if delivery or cancellation is unreliable',
  },
  'Stablecoin Wrapper': {
    enter: 'Wrap a small supported stablecoin deposit after checking backing, conversion fees and the documented unwrap procedure',
    maintain: 'Review wrapped stablecoin backing and price; test a partial unwrap instead of looping conversions for speculative points',
    risk: 'Check wrapper custody, reserve attestations and redemption liquidity; unwrap if backing evidence or peg stability deteriorates',
  },
  'Decentralized BTC': {
    enter: 'Deposit a small supported BTC amount only after checking custody, receipt backing and the BTC redemption procedure',
    maintain: 'Review BTC backing and settlement finality; test a partial receipt redemption without borrowing against the BTC deposit',
    risk: 'Check BTC custody, signer assumptions and redemption queues; stop deposits if receipt backing or the BTC exit is uncertain',
  },
  fallback: {
    enter: 'Read product eligibility and supported assets; test the smallest documented deposit or purchase only if a reversible exit is available',
    maintain: 'Use one documented core feature, record its receipt and fees, and test an exit; skip features that require leverage or unclear custody',
    risk: 'Inspect smart-contract audits, custody and redemption conditions; unwind if asset backing, price stability or withdrawal liquidity deteriorates',
  },
};

function playbook(category: string): Playbook {
  if (PLAYBOOKS[category]) return PLAYBOOKS[category]!;
  if (/Curator|Capital Allocator/i.test(category)) return PLAYBOOKS['Risk Curators']!;
  if (/Vault|Yield|Farm|CeDeFi/i.test(category)) return PLAYBOOKS.Yield!;
  if (/DEX|AMM/i.test(category)) return PLAYBOOKS.Dexs!;
  if (/Lending/i.test(category)) return PLAYBOOKS.Lending!;
  if (/Restak/i.test(category)) return PLAYBOOKS.Restaking!;
  if (/Staking/i.test(category)) return PLAYBOOKS.Staking!;
  if (/Bridge/i.test(category)) return PLAYBOOKS.Bridge!;
  if (/CDP|Stablecoin/i.test(category)) return PLAYBOOKS.CDP!;
  if (/Derivatives/i.test(category)) return PLAYBOOKS.Derivatives!;
  if (/Payment|Card/i.test(category)) return PLAYBOOKS.Payments!;
  if (/BTC/i.test(category)) return PLAYBOOKS['Decentralized BTC']!;
  if (/Marketplace/i.test(category)) return PLAYBOOKS['OTC Marketplace']!;
  return PLAYBOOKS.fallback!;
}

export function farmTier(tvl: number): { label: string; capital: number; weeks: number } {
  if (tvl >= 1_000_000_000) return { label: 'large-TVL', capital: 250, weeks: 4 };
  if (tvl >= 100_000_000) return { label: 'mid-TVL', capital: 100, weeks: 6 };
  return { label: 'small-TVL', capital: 50, weeks: 8 };
}

export interface StepMeta {
  cost_low_usd: number;
  cost_high_usd: number;
  minutes: number;
  title: string;
  kind: string;
  transactions: number;
}

export function dollarAmount(amount: number): string {
  return amount.toFixed(2);
}

export function farmPlan(protocol: SnapshotProtocol, ageDays: number) {
  const chain = protocol.chains[0] ?? 'the listed network';
  const category = protocol.category ?? 'Uncategorized';
  const tier = farmTier(protocol.tvl_usd);
  const book = playbook(category);
  const gas = GAS_USD[chain] ?? DEFAULT_GAS_USD;
  const gasRange = `$${dollarAmount(gas[0])}-$${dollarAmount(gas[1])}`;
  const context = `${protocol.name} [${protocol.slug}] on ${chain} (${category}, ${tier.label})`;
  const capitalNote = tier.label === 'large-TVL'
    ? `$${tier.capital} minimum-viable-capital budget; high TVL means points dilution, not guaranteed rewards`
    : tier.label === 'mid-TVL' ? `$${tier.capital} standard capital budget`
      : `$${tier.capital} capital budget; smaller tickets acceptable`;
  const actions: { kind: string; title: string; action: string; transactions: number; minutes: number }[] = [];
  const add = (kind: string, title: string, action: string, transactions: number, minutes: number) => {
    actions.push({ kind, title, action, transactions, minutes });
  };
  const outflow = (protocol.change_7d ?? 0) <= -15;
  if (outflow) {
    add('outflow', 'Investigate outflows first', `TVL fell ${protocol.change_7d}% in seven days: check why TVL is leaving, verify contract risk, audits and exit liquidity before depositing; skip the plan if losses are unexplained`, 0, 25);
  }
  add('setup', 'Verify & fund', `Verify official app and contract addresses against documentation; use a limited-balance wallet. Set a ${capitalNote}; never spend beyond a loss budget`, 1, 15);
  add('enter', 'Make the first position', `${book.enter}; use at most the $${tier.capital} capital budget and check quoted fees before signing`, 2, 20);
  add('maintain', 'Maintain & test an exit', `${book.maintain}; reuse the same $${tier.capital} position once weekly for ${tier.weeks} weeks, not new capital each visit`, tier.weeks, 10 * tier.weeks);
  add('risk', 'Set the risk boundary', `${book.risk}; capital can be lost. Review weekly for ${tier.weeks} weeks and reserve one exit transaction`, 1, 15 * tier.weeks);
  if (protocol.chains.length >= 4) {
    add('multichain', 'Bridge & test another chain', `Bridge a small part of the existing $${tier.capital} budget from ${chain} to ${protocol.chains[1]} and test one supported multi-chain interaction; verify bridge risk and a reversible exit. Gas allowance uses the primary chain only; secondary fees need a fresh quote`, 3, 30);
  }
  if ((protocol.change_7d ?? 0) >= 15) {
    add('crowding', 'Check crowding & the early window', `TVL grew ${protocol.change_7d}% in seven days: points dilution may be accelerating. Check the early window and early-lock terms if published; never accept an unsafe lock merely to beat the crowd`, 1, 20);
  }
  if (ageDays >= 365) {
    add('tge', 'Watch TGE-near signals', `Tracking age is ${ageDays} days: inspect TGE-near announcements without assuming a launch date, check sybil snapshot risk and keep one genuine monthly activity for three months using the existing budget`, 3, 45);
  } else if (ageDays < 90) {
    add('early', 'Check early-user multipliers', `Tracking age is ${ageDays} days: check whether an early-user weighting window or early-multiplier rule is published; record genuine usage before the window closes, without assuming points exist`, 1, 20);
  }
  add('launch', 'Verify eligibility snapshot & claim procedure', `Verify ${protocol.name}'s eligibility snapshot and claim procedure if published: check cutoff, qualifying actions, sybil rules, claim window and contract; log rules weekly for ${tier.weeks} weeks. No published procedure means no claim; no claim transaction is budgeted`, 0, 10 * tier.weeks);
  const selected = actions;
  const steps_meta: StepMeta[] = selected.map((action) => ({
    cost_low_usd: Number((gas[0] * action.transactions).toFixed(2)),
    cost_high_usd: Number((gas[1] * action.transactions).toFixed(2)),
    minutes: action.minutes,
    title: action.title,
    kind: action.kind,
    transactions: action.transactions,
  }));
  const farm_steps = selected.map((action, index) => {
    const meta = steps_meta[index]!;
    const count = action.transactions === 1 ? '1 transaction' : `${action.transactions} transactions`;
    const cost = action.transactions === 0
      ? `$0 to read; if a transaction is later signed, ${gasRange} gas per transaction (0 transactions budgeted)`
      : `${gasRange} gas per transaction; plan ${count} ($${dollarAmount(meta.cost_low_usd)}-$${dollarAmount(meta.cost_high_usd)} total gas)`;
    return `For ${context}: ${action.action}. Cost: ${cost}; capital reused, fees/slippage extra. Time: ${meta.minutes} minutes total.`;
  });
  for (const step of farm_steps) if (step.trim().length < 20 || step.trim().length > 600) throw new Error(`Farm step length ${step.length} at ${protocol.slug}`);
  return {
    farm_steps,
    steps_meta,
    totals: {
      cost_low: Number(steps_meta.reduce((total, step) => total + step.cost_low_usd, 0).toFixed(2)),
      cost_high: Number(steps_meta.reduce((total, step) => total + step.cost_high_usd, 0).toFixed(2)),
      total_minutes: steps_meta.reduce((total, step) => total + step.minutes, 0),
    },
  };
}

export function farmSteps(protocol: SnapshotProtocol, ageDays = 0): string[] {
  return farmPlan(protocol, ageDays).farm_steps;
}
