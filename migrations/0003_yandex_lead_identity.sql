CREATE UNIQUE INDEX IF NOT EXISTS leads_owner_yandex_id
ON leads(owner, json_extract(data, '$.yandexId'))
WHERE json_extract(data, '$.yandexId') IS NOT NULL;
