from pyjsparser import parse
import sys

try:
    content = open('dashboard-prototype/orders.js', encoding='utf-8').read()
    parse(content)
    print('Syntax OK')
except Exception as e:
    print(f'Syntax Error: {e}')
