// Supabase silently caps a single query response at 1000 rows and drops
// the rest — no error, no warning, the query just returns fewer rows than
// actually exist. Three of the daily cron jobs already work around this by
// hand-rolling the same range() loop; this is that loop, factored out once
// so every future call site (this project's pricing now goes up to 500+
// units, and several landlord-facing list pages read one row per unit or
// per rent month) gets it for free instead of risking a fourth copy that
// quietly forgets it.
//
// Returns whatever it managed to accumulate alongside the error rather
// than throwing — a page that already showed 3 pages of real data before
// page 4 failed shouldn't discard it, and every call site decides for
// itself whether a partial result is still worth showing or should be
// treated as a failure (see fetchAllPagesOrThrow below for the common
// "no, treat it as a failure" case).
export async function fetchAllPages<T>(
  buildQuery: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
  pageSize = 500
): Promise<{ data: T[]; error: unknown }> {
  const out: T[] = []
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await buildQuery(from, from + pageSize - 1)
    if (error) {
      console.error('fetchAllPages: query failed', error)
      return { data: out, error }
    }
    out.push(...(data || []))
    if (!data || data.length < pageSize) break
  }
  return { data: out, error: null }
}

// For call sites that treat any failure the same way the original
// single-query code did — data-or-empty, no explicit error branch. Most
// of this project's existing `const { data } = await query` call sites
// already accept that silently, so this preserves that exact behavior
// instead of forcing every caller to handle an error it wasn't handling
// before.
export async function fetchAllPagesOrEmpty<T>(
  buildQuery: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
  pageSize = 500
): Promise<T[]> {
  const { data } = await fetchAllPages(buildQuery, pageSize)
  return data
}
