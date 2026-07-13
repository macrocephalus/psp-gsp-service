#!/usr/bin/env bash
# использование: ./scripts/send-webhook.sh psp stripe brandA evt_001
SOURCE=$1; PROVIDER=$2; BRAND=$3; EVENT_ID=$4
SECRET=$([ "$SOURCE" = "psp" ] && echo "psp_dev_secret" || echo "gsp_dev_secret")
BODY="{\"eventId\":\"$EVENT_ID\",\"type\":\"deposit.succeeded\",\"data\":{\"amount\":100,\"currency\":\"EUR\"}}"
# подпись покрывает "<brandId>.<rawBody>" — см. WebhookSignatureGuard
SIG=$(printf '%s' "$BRAND.$BODY" | openssl dgst -sha256 -hmac "$SECRET" | awk '{print $2}')

curl -i -X POST "http://localhost:3000/webhooks/$SOURCE/$PROVIDER" \
  -H 'Content-Type: application/json' \
  -H "X-Brand-Id: $BRAND" \
  -H "X-Signature: sha256=$SIG" \
  -d "$BODY"
