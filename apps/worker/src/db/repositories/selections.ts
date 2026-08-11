import type {
  ExtractionMode,
  MatchMode,
  NormalizationConfig,
  Selection,
  SelectionInput,
  SelectorCandidate,
  SelectorType,
} from '@web-monitor/shared';
import { DEFAULT_NORMALIZATION_CONFIG } from '@web-monitor/shared';

interface SelectionRow {
  id: string;
  monitor_id: string;
  label: string;
  selector_type: string;
  selector: string;
  selector_candidates_json: string;
  extraction_mode: string;
  attribute_name: string | null;
  normalization_json: string;
  match_mode: string;
  order_index: number;
  created_at: string;
  updated_at: string;
}

function mapRow(row: SelectionRow): Selection {
  return {
    id: row.id,
    monitorId: row.monitor_id,
    label: row.label,
    selectorType: row.selector_type as SelectorType,
    selector: row.selector,
    selectorCandidates: JSON.parse(row.selector_candidates_json) as SelectorCandidate[],
    extractionMode: row.extraction_mode as ExtractionMode,
    attributeName: row.attribute_name,
    normalization: {
      ...DEFAULT_NORMALIZATION_CONFIG,
      ...(JSON.parse(row.normalization_json) as Partial<NormalizationConfig>),
    },
    matchMode: row.match_mode as MatchMode,
    orderIndex: row.order_index,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listSelectionsByMonitor(
  db: D1Database,
  monitorId: string,
): Promise<Selection[]> {
  const { results } = await db
    .prepare('SELECT * FROM selections WHERE monitor_id = ? ORDER BY order_index ASC')
    .bind(monitorId)
    .all<SelectionRow>();
  return results.map(mapRow);
}

export async function listSelectionsByMonitorIds(
  db: D1Database,
  monitorIds: string[],
): Promise<Map<string, Selection[]>> {
  const map = new Map<string, Selection[]>();
  if (monitorIds.length === 0) return map;
  const placeholders = monitorIds.map(() => '?').join(', ');
  const { results } = await db
    .prepare(
      `SELECT * FROM selections WHERE monitor_id IN (${placeholders}) ORDER BY monitor_id, order_index ASC`,
    )
    .bind(...monitorIds)
    .all<SelectionRow>();
  for (const row of results) {
    const selection = mapRow(row);
    const existing = map.get(selection.monitorId) ?? [];
    existing.push(selection);
    map.set(selection.monitorId, existing);
  }
  return map;
}

/**
 * Upserts by id rather than blind delete+reinsert: a Selection kept across
 * an edit (input.id matches an existing row for this Monitor) keeps its
 * database id, since computeResultHash/diffSelectionIds key off selectionId
 * (§8.4) — regenerating ids for untouched Selections would make the next
 * check misreport them as changed. Inputs with no id, or an id that isn't
 * one of this Monitor's own rows, are inserted as new. Existing rows whose
 * id is no longer present in `inputs` are deleted (removed by the caller).
 */
export async function replaceSelectionsForMonitor(
  db: D1Database,
  monitorId: string,
  inputs: SelectionInput[],
  idGenerator: () => string,
  now: string,
): Promise<void> {
  const existing = await listSelectionsByMonitor(db, monitorId);
  const existingIds = new Set(existing.map((s) => s.id));
  const keepIds = new Set(
    inputs.map((i) => i.id).filter((id): id is string => id !== undefined && existingIds.has(id)),
  );

  for (const row of existing) {
    if (!keepIds.has(row.id)) {
      await db.prepare('DELETE FROM selections WHERE id = ?').bind(row.id).run();
    }
  }

  for (const input of inputs) {
    if (input.id && keepIds.has(input.id)) {
      await db
        .prepare(
          `UPDATE selections
           SET label = ?, selector_type = ?, selector = ?, selector_candidates_json = ?,
               extraction_mode = ?, attribute_name = ?, normalization_json = ?, match_mode = ?,
               order_index = ?, updated_at = ?
           WHERE id = ?`,
        )
        .bind(
          input.label,
          input.selectorType,
          input.selector,
          JSON.stringify(input.selectorCandidates),
          input.extractionMode,
          input.attributeName,
          JSON.stringify(input.normalization ?? DEFAULT_NORMALIZATION_CONFIG),
          input.matchMode,
          input.orderIndex,
          now,
          input.id,
        )
        .run();
    } else {
      await db
        .prepare(
          `INSERT INTO selections (
            id, monitor_id, label, selector_type, selector, selector_candidates_json,
            extraction_mode, attribute_name, normalization_json, match_mode, order_index,
            created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          idGenerator(),
          monitorId,
          input.label,
          input.selectorType,
          input.selector,
          JSON.stringify(input.selectorCandidates),
          input.extractionMode,
          input.attributeName,
          JSON.stringify(input.normalization ?? DEFAULT_NORMALIZATION_CONFIG),
          input.matchMode,
          input.orderIndex,
          now,
          now,
        )
        .run();
    }
  }
}
