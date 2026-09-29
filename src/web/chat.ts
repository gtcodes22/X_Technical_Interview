// M0 placeholder: proves the page ↔ function wiring. Replaced by the real chat client in M3.
export {};
const status = document.querySelector<HTMLParagraphElement>("#status")!;

fetch("/api/health")
  .then((res) => res.json())
  .then((health: { status: string; commit: string }) => {
    status.textContent = `Service ${health.status} · ${health.commit.slice(0, 7)}`;
  })
  .catch(() => {
    status.textContent = "Service unavailable";
  });
