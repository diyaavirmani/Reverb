# Local n8n Setup

## Prerequisites

- Docker Desktop with Docker Compose v2
- The Reverb Fill repository checked out locally
- No service using port `5678`, or a different `N8N_PORT` in `n8n/.env`

## Configure

1. Create `n8n/.env` from `n8n/.env.example`.
2. Generate unique values for `N8N_ENCRYPTION_KEY` and `N8N_INTERNAL_SECRET`.
3. Keep `n8n/.env` local. Git ignores it; never add it to source control.
4. Leave the Google Sheet and Data Table IDs blank until those resources exist.

The Compose service runs one n8n instance, persists n8n state in the `n8n_data` Docker volume, and mounts `n8n/workflows` read-only at `/workflows` for manual imports.

## Start And Stop

From Git Bash, WSL, or another POSIX shell:

```sh
./scripts/start-n8n.sh
./scripts/stop-n8n.sh
```

Equivalent PowerShell commands:

```powershell
docker compose --env-file n8n/.env up -d n8n
docker compose --env-file n8n/.env down
```

Open `http://localhost:5678`, create the local owner account, and keep the instance private to the development machine.

## Manual Workflow Import

1. Open n8n and select **Import from File**.
2. Choose a JSON file from `n8n/workflows` or `/workflows` inside the container.
3. Assign the referenced Data Table IDs or Google Sheets credential in the n8n editor.
4. Verify every workflow remains inactive while configuring it.
5. Test manually with fixture payloads before activation.

Import workflows in numeric order. Workflows `10` through `14` depend on the technical workflows and storage gateway configured by workflows `01` through `05`. See `BUSINESS_WORKFLOWS.md` for endpoint variables, node behavior, fixture paths, and activation order.

Run `npm run validate:n8n` before importing or committing workflow changes.

## Data Tables

Create the following tables in n8n. Use the exact lowercase names and column names. Copy each generated table ID into `n8n/.env` after creation.

### `processed_events`

| Column | Suggested type |
| --- | --- |
| `event_id` | String |
| `event_type` | String |
| `source` | String |
| `processed_at` | Date |
| `result_json` | String |

Set `N8N_PROCESSED_EVENTS_TABLE_ID` to this table's ID.

### `payment_locks`

| Column | Suggested type |
| --- | --- |
| `campaign_id` | String |
| `prava_session_id` | String |
| `checkout_attempted` | Boolean |
| `checkout_status` | String |
| `merchant_order_id` | String |
| `updated_at` | Date |

Set `N8N_PAYMENT_LOCKS_TABLE_ID` to this table's ID. Treat `campaign_id` as the business-unique lock key. A failed row must never be deleted or reset.

### `conversation_state`

| Column | Suggested type |
| --- | --- |
| `conversation_id` | String |
| `owner_handle` | String |
| `spot_id` | String |
| `collected_fields_json` | String |
| `missing_fields_json` | String |
| `updated_at` | Date |

Set `N8N_CONVERSATION_STATE_TABLE_ID` to this table's ID. Store only campaign intake fields; payment and checkout data do not belong in this table.

## Google Sheets

Create the `Reverb_Fill_Operations` workbook from the CSV templates under `fixtures/sheets`. Set `REVERB_FILL_SHEET_ID` to its spreadsheet ID. Google credentials are assigned manually in n8n and never stored in workflow JSON.

## Persistence And Reset

`docker compose down` preserves the `n8n_data` volume. A volume deletion removes local workflows, credentials, Data Tables, and execution history, so do not delete the volume as part of routine shutdown.
