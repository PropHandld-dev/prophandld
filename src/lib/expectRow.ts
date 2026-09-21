// A blocked update (a permission rule said no, or the row is no longer as
// expected) does not raise an error: the database simply changes nothing, and
// the screen carries on as if it worked. Asking for the changed rows back and
// treating "none" as a failure lets the page say so instead of silently
// leaving things out of step.
export async function expectRow(query: any): Promise<{ error: { message: string; code?: string } | null }> {
  const { data, error } = await query.select('id')
  if (error) return { error }
  if (!data || data.length === 0) {
    return {
      error: {
        message: 'That change was not saved. You may not have permission, or it was already changed. Refresh and try again.',
      },
    }
  }
  return { error: null }
}
