import { query } from '../config/db.js';
import * as parentMsgs from '../services/parentMessages.service.js';
import { ensureParentsSchema } from '../db/autoMigrate.js';

const toE164 = (raw) => {
  if (!raw) return '';
  const s = String(raw).trim();
  const digits = s.replace(/^\+?/, '').replace(/\D/g, '');
  if (!digits) return '';
  return `+${digits}`;
};

export const twilioInbound = async (req, res, next) => {
  try {
    await ensureParentsSchema();
    const fromRaw = req.body?.From || req.body?.from || '';
    const toRaw = req.body?.To || req.body?.to || '';
    const body = req.body?.Body || req.body?.body || '';
    if (!fromRaw || !body) return res.status(400).json({ ok: false });
    const from = toE164(fromRaw);
    const to = toE164(toRaw);

    const { rows } = await query(
      'SELECT id FROM parents WHERE REPLACE(whatsapp_phone, \' \', \'\') ILIKE $1 LIMIT 1',
      [from.replace(/^\+/, '%')]
    );
    const parentId = rows[0]?.id || null;
    if (parentId) {
      await parentMsgs.create({
        parentId,
        childId: null,
        to,
        from,
        channel: 'twilio',
        direction: 'inbound',
        body,
        status: 'received',
        campusId: null
      });
    }
    res.status(200).json({ ok: true });
  } catch (e) { next(e); }
};
