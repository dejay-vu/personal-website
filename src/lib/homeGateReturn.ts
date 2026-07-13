const HOME_GATE_RETURN_KEY = 'neonHomeGateReturn';

type HomeGateReturn = {
  destination: string;
  historyLength: number;
  returning: boolean;
  scrollY: number;
};

function readHomeGateReturn(): HomeGateReturn | null {
  try {
    const value = JSON.parse(
      sessionStorage.getItem(HOME_GATE_RETURN_KEY) ?? 'null',
    ) as Partial<HomeGateReturn> | null;

    if (
      !value ||
      typeof value.destination !== 'string' ||
      typeof value.historyLength !== 'number' ||
      typeof value.returning !== 'boolean' ||
      typeof value.scrollY !== 'number' ||
      !Number.isFinite(value.scrollY)
    ) {
      clearHomeGateReturn();
      return null;
    }

    return value as HomeGateReturn;
  } catch {
    clearHomeGateReturn();
    return null;
  }
}

function writeHomeGateReturn(value: HomeGateReturn) {
  try {
    sessionStorage.setItem(HOME_GATE_RETURN_KEY, JSON.stringify(value));
  } catch {
    // History restoration remains a best-effort enhancement.
  }
}

export function rememberHomeGateReturn(destination: string) {
  writeHomeGateReturn({
    destination,
    historyLength: window.history.length,
    returning: false,
    scrollY: window.scrollY,
  });
}

export function prepareHomeGateReturn(destination: string) {
  const value = readHomeGateReturn();

  if (value?.destination !== destination) return null;

  const pending = { ...value, returning: true };
  writeHomeGateReturn(pending);
  return pending;
}

export function clearHomeGateReturn() {
  try {
    sessionStorage.removeItem(HOME_GATE_RETURN_KEY);
  } catch {
    // Storage may be disabled; there is nothing else to clear.
  }
}

export function getHomeGateScrollRestore() {
  const value = readHomeGateReturn();

  if (!value?.returning) {
    clearHomeGateReturn();
    return null;
  }

  return value.scrollY;
}
