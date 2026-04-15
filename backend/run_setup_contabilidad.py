"""Wrapper to run setup_contabilidad_db.py with local SQL Server driver"""
import os
import pyodbc

# Force local driver before anything else
os.environ['ODBC_DRIVER'] = '{SQL Server}'

# Patch dotenv to not override ODBC_DRIVER
from dotenv import load_dotenv
_orig_load = load_dotenv
def patched_load(*a, **kw):
    saved = os.environ.get('ODBC_DRIVER')
    _orig_load(*a, **kw)
    if saved:
        os.environ['ODBC_DRIVER'] = saved
import dotenv
dotenv.load_dotenv = patched_load

# Now import and run
from setup_contabilidad_db import setup_contabilidad
setup_contabilidad()
