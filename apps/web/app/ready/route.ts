export async function GET() {
  try {
    const response = await fetch(new URL('/ready', process.env.API_BASE_URL), {
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw new Error('Dependency unavailable');
    return Response.json(
      { status: 'ready', service: 'web' },
      { headers: { 'cache-control': 'no-store' } },
    );
  } catch {
    return Response.json(
      { status: 'unavailable' },
      { status: 503, headers: { 'cache-control': 'no-store' } },
    );
  }
}
