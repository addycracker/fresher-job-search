import mongoose from 'mongoose';
import { setServers } from 'node:dns/promises';
import { isIP } from 'node:net';
import { message } from './messages.js';

export async function connectDatabase(options: { timeoutMs?: number } = {}) {
  const uri = process.env.MONGODB_URI?.trim();
  if (!uri) throw new Error(message('mongodbUriRequired'));
  const dnsServers = process.env.DNS_SERVERS?.trim();
  if (dnsServers) {
    const servers = dnsServers.split(',').map((server) => server.trim());
    if (servers.some((server) => !isIP(server))) throw new Error(message('invalidDnsServers'));
    setServers(servers);
  }
  const timeoutMs = options.timeoutMs ?? 10_000;
  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: timeoutMs,
    connectTimeoutMS: timeoutMs,
    ...(options.timeoutMs === undefined ? {} : { timeoutMS: timeoutMs }),
    autoIndex: false,
    autoCreate: false,
  });
}

export async function disconnectDatabase() {
  await mongoose.disconnect();
}
