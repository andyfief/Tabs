/** Strip leading @ and $ characters that users may include in their handles. */
function cleanHandle(handle: string): string {
  return handle.replace(/^[@$]+/, '');
}

function buildNote(amount: number, tabName: string): string {
  return `Closing $${amount.toFixed(2)} from ${tabName} via Tabs`;
}

export function buildVenmoLink(handle: string, amount: number, tabName: string): string {
  const h = encodeURIComponent(cleanHandle(handle));
  const note = encodeURIComponent(buildNote(amount, tabName));
  return `https://venmo.com/${h}/pay?amount=${amount.toFixed(2)}&note=${note}`;
}

export function buildCashAppLink(handle: string, amount: number, tabName: string): string {
  const h = encodeURIComponent(cleanHandle(handle));
  return `https://cash.app/$${h}/${amount.toFixed(2)}`;
}
