"""Start real simulated services, exercise the TS library client, then clean up."""
from probe import Native, WORKSPACE, subprocess

session = Native('library-client')
try:
    session.start()
    result = subprocess.run(
        ['node',
         str(WORKSPACE / 'tools/microduck/native/client-worker.mjs'),
         str(session.state / 'r.sock')],
        capture_output=True, text=True, timeout=15,
    )
    (session.out / 'client-result.json').write_text(result.stdout)
    (session.out / 'client-stderr.log').write_text(result.stderr)
    print(result.stdout, flush=True)
    result.check_returncode()
finally:
    session.close()
