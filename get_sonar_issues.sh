#!/bin/bash

# Получение полного списка проблем из SonarQube
curl -s "http://localhost:9000/api/issues/search?projectKeys=bilateral_bound&issueStatuses=OPEN,CONFIRMED,REOPENED&p=1&ps=500" | jq -r '.issues[] | {
  rule: .rule,
  severity: .severity,
  type: .type,
  component: (.component | sub(".*bilateral_bound/"; "")),
  line: .line,
  message: .message,
  tags: (.tags | join(",")),
  quickFixAvailable: .quickFixAvailable
} | "Файл: \(.component), строка \(.line), \(.type)/\(.severity): [\(.rule)] \(.message)"' > sonar_issues.txt

echo "Проблемы сохранены в sonar_issues.txt"
