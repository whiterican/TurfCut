/**
 * A server action's database call that fails (a transaction that times out behind another cut or a purge, a
 * full connection pool) is a message to try again, not the error page. Only the error's code is logged, never
 * its message: a database message can quote the data it was handling.
 */
// It may have gone through (a save that committed as its answer timed out): trying again is safe either way,
// because a repeated worker tap counts once and a repeated cut leaves out what is already on the job's books.
export const TRY_AGAIN = "That may not have gone through. Try again in a moment.";

export async function orTryAgain<T>(what: string, run: () => Promise<T>): Promise<T | null> {
  try {
    return await run();
  } catch (e) {
    const code = typeof e === "object" && e && "code" in e && typeof e.code === "string" ? e.code : "unknown";
    console.error(`[turfcut] ${what} failed (${code})`);
    return null;
  }
}
