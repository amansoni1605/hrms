import { NextResponse }           from 'next/server';
import { withRoute }              from '@/lib/withRoute';
import { getInfrastructureHealth, getDEKCacheStats } from '@/infrastructure/multiTenantCore';
import mongoose                   from 'mongoose';
import os                         from 'node:os';

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/system/health
//
// Returns runtime telemetry for the SUPER_ADMIN System Health Cockpit:
//   • DEK cache: hit-rate, misses, provisions, evictions
//   • Mongoose plugin registration status
//   • CSFLE supported wire-format versions
//   • Process: memory, uptime, Node version
//   • Mongo: connection readyState, dbName
//   • Host: CPU count, load average, hostname
//
// super_admin only.
// ─────────────────────────────────────────────────────────────────────────────

export const GET = withRoute(async () => {
  const infra = getInfrastructureHealth();
  const mem   = process.memoryUsage();

  // Mongo connection state
  // 0=disconnected, 1=connected, 2=connecting, 3=disconnecting
  const mongoStates: Record<number, string> = {
    0: 'disconnected', 1: 'connected', 2: 'connecting', 3: 'disconnecting', 99: 'uninitialized',
  };
  const mongoState = mongoStates[mongoose.connection.readyState] ?? 'unknown';

  const collections = mongoose.connection.db
    ? (await mongoose.connection.db.listCollections({}, { nameOnly: true }).toArray()).length
    : 0;

  return NextResponse.json({
    timestamp:   new Date().toISOString(),
    infra,
    process:     {
      uptimeSec:        Math.round(process.uptime()),
      nodeVersion:      process.version,
      pid:              process.pid,
      memory: {
        rssMb:           Math.round(mem.rss          / 1_048_576),
        heapUsedMb:      Math.round(mem.heapUsed     / 1_048_576),
        heapTotalMb:     Math.round(mem.heapTotal    / 1_048_576),
        externalMb:      Math.round(mem.external     / 1_048_576),
        arrayBuffersMb:  Math.round(mem.arrayBuffers / 1_048_576),
      },
    },
    mongo:       {
      readyState:  mongoose.connection.readyState,
      stateLabel:  mongoState,
      dbName:      mongoose.connection.name ?? null,
      host:        mongoose.connection.host ?? null,
      port:        mongoose.connection.port ?? null,
      collectionCount: collections,
    },
    host:        {
      platform:       os.platform(),
      release:        os.release(),
      arch:           os.arch(),
      hostname:       os.hostname(),
      cpuCount:       os.cpus().length,
      loadAverage:    os.loadavg(),
      freeMemoryMb:   Math.round(os.freemem() / 1_048_576),
      totalMemoryMb:  Math.round(os.totalmem() / 1_048_576),
    },
  });
}, ['super_admin']);
