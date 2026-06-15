const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

export async function pollTransactionStatus(
  clientId: string,
  checkStatusFn: () => Promise<{ completed: boolean }>,
  maxAttempts = 5,
  maxDelay = 30_000
) {
  let attempt = 0;

  while (attempt < maxAttempts) {
    const res = await checkStatusFn();
    if (res.completed) return res;

    attempt++;
    if (attempt >= maxAttempts) break;

    const nextDelay = Math.min(Math.pow(2, attempt) * 1000, maxDelay);
    await delay(nextDelay);
  }

  throw new Error(
    `[Akropolys SDK] Transaction timeout for client "${clientId}" after ${maxAttempts} attempts.`
  );
}
