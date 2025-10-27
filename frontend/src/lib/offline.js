import { openDB } from 'idb'

const DB_NAME = 'cleanwater-offline'
const STORE = 'report-queue'

async function db() {
  return openDB(DB_NAME, 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true })
      }
    },
  })
}

export async function queueReport(payload) {
  const d = await db()
  await d.add(STORE, { payload, createdAt: Date.now(), status: 'pending' })
}

export async function getQueuedReports() {
  const d = await db()
  return d.getAll(STORE)
}

export async function clearQueue() {
  const d = await db()
  const tx = d.transaction(STORE, 'readwrite')
  await tx.store.clear()
  await tx.done
}
