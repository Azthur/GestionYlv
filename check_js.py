with open('dashboard-prototype/reparto.js', 'r', encoding='utf-8') as f:
    text = f.read()

single_quotes = text.count("'")
double_quotes = text.count('"')
backticks = text.count('`')
print('Single:', single_quotes, 'Double:', double_quotes, 'Backticks:', backticks)
if backticks % 2 != 0: print('ERROR: Odd number of backticks')
