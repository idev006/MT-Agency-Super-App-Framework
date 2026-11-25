export function systemHealth(info) {
  const health={
   service:"p6-vehicle-contact",status:"ready",apiVersion:"v1",
   backendVersion:"0.9.28",releaseChannel:"development"
  };
  // Non-sensitive connection metadata for the post-signin system panel: engine name and
  // dual-write flag only. Never project ids, database ids, endpoints or credentials.
  if(info&&info.persistence)health.persistence={engine:info.persistence.engine,dualWrite:!!info.persistence.dualWrite};
  return health;
}
