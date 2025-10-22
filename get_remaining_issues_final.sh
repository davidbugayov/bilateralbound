#!/bin/bash

echo "🔍 Получение актуальных данных о проблемах SonarQube SonarQube v9+..."

# Используем токен аутентификации
TOKEN="sqa_003c712ce06d9ce1565fdc8dbf2267111d010b4a"

# Получаем данные через API
API_RESPONSE=$(curl -s -H "Authorization: Bearer $TOKEN" "http://localhost:9000/api/issues/search?projectKeys=bilateral_bound&issueStatuses=OPEN,CONFIRMED&ps=500")

# Проверяем успешность запроса
if [[ "$API_RESPONSE" == *"total"* ]]; then
    echo "$API_RESPONSE" | jq -r '.total'
    echo "Проблем: $(echo "$API_RESPONSE" | jq -r '.total')"
    echo "$API_RESPONSE" | jq -r '.issues[] | "\(.rule) \(.message) \(.component | split("/")[-1]):\(.line)"' | head -10 > issues_list.txt
    echo "Топ-10 проблем сохранены в issues_list.txt"

    # Статистика по типам
    echo "=== СТАТИСТИКА ПО ТИПАМ ПРОБЛЕМ ==="
    echo "$API_RESPONSE" | jq -r '.issues[].type' | sort | uniq -c | sort -nr

    # Топ правил
    echo "=== ТОП-10 ПРАВИЛ ==="
    echo "$API_RESPONSE" | jq -r '.issues[].rule' | sort | uniq -c | sort -nr | head -10
else
    echo "❌ Ошибка доступа к API: $API_RESPONSE"

    # Попытка без аутентификации (для публичных проектов)
    echo "Пробуем без аутентификации..."
    PUBLIC_RESPONSE=$(curl -s "http://localhost:9000/api/issues/search?projectKeys=bilateral_bound&ps=50")
    if [[ "$PUBLIC_RESPONSE" == *"total"* ]]; then
        echo "$PUBLIC_RESPONSE" | jq -r '.total'
        echo "$PUBLIC_RESPONSE" | jq -r '.issues[] | "\(.rule): \(.message)"' | head -5
    else
        echo "❌ API недоступен. Пожалуйста, откройте дашборд SonarQube и сообщите количество проблем."
        echo "http://localhost:9000/dashboard?id=bilateral_bound"
    fi
fi
