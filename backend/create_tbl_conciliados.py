import pyodbc
from database import get_db_connection

conn = get_db_connection()
cursor = conn.cursor()

create_table_sql = """
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[tbl_Conciliados]') AND type in (N'U'))
BEGIN
CREATE TABLE [dbo].[tbl_Conciliados](
    [Id] [int] IDENTITY(1,1) NOT NULL,
    [ReconciliationDetailId] [int] NULL, -- Reference to the match detail if needed
    [IdCobranza_CodCia] [char](2) NULL,
    [IdCobranza_coddoc] [char](2) NULL,
    [IdCobranza_nrodoc] [varchar](20) NULL,
    [IdCobranza_nroitm] [varchar](10) NULL,
    [codref] [varchar](20) NULL,
    [nroref] [varchar](20) NULL,
    [importe] [numeric](18, 2) NULL,
    [codaux] [varchar](20) NULL,
    [IdBanco] [int] NULL,
    [Fecha_banco] [datetime] NULL,
    [empresa] [varchar](10) NULL,
    [codigo_banco] [varchar](10) NULL,
    [CreatedAt] [datetime] DEFAULT GETDATE()
PRIMARY KEY CLUSTERED 
(
    [Id] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON) ON [PRIMARY]
) ON [PRIMARY]
END
"""

try:
    cursor.execute(create_table_sql)
    conn.commit()
    print("tbl_Conciliados created successfully.")
except Exception as e:
    print(f"Error creating table: {e}")
finally:
    conn.close()
