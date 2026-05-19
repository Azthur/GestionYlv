import re

file_path = 'cargos_documentales.js'

with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Fix facturas properties in rowCallback and event
content = content.replace("data.serie_comprobante + '|' + data.nro_comprobante + '|' + data.num_ruc", "data.Serie + '|' + data.Numero + '|' + data.NumRucProveedor")
content = content.replace("rowData.serie_comprobante + '|' + rowData.nro_comprobante + '|' + rowData.num_ruc", "rowData.Serie + '|' + rowData.Numero + '|' + rowData.NumRucProveedor")

# Fix facturas in generarCargo
content = content.replace("const serie = row.serie_comprobante || '';", "const serie = row.Serie || '';")
content = content.replace("const numero = row.nro_comprobante || '';", "const numero = row.Numero || '';")
content = content.replace("row.monto_total || 0", "row.Total || 0")
content = content.replace("row.nombre_proveedor || ''", "row.NomProveedor || ''")
content = content.replace("row.num_ruc || ''", "row.NumRucProveedor || ''")
content = content.replace("row.moneda || '1'", "row.CodMoneda || '1'")
content = content.replace("row.tipo_comprobante || ''", "row.CodTipoDoc || ''")
content = content.replace("row.fecha_emision || null", "row.FecEmision || null")
content = content.replace("row.fecha_vencimiento || null", "row.FecVencimiento || null")

# Fix rendiciones properties in rowCallback and event
content = content.replace("data.nro_rendicion", "data.NroRendicion")
content = content.replace("rowData.nro_rendicion", "rowData.NroRendicion")

# Fix rendiciones in generarCargo
content = content.replace("const nroRendicion = row.nro_rendicion;", "const nroRendicion = row.NroRendicion;")
content = content.replace("row.total_rendido || 0", "row.TotalRendido || 0")
content = content.replace("row.nom_auxiliar || ''", "row.NomAuxiliar || ''")
content = content.replace("row.cod_auxiliar || ''", "row.CodAuxiliar || ''")
# moneda in rendiciones might be CodMoneda
# fec_registro -> FecRegistro

content = content.replace("row.moneda || '1'", "row.CodMoneda || '1'")
content = content.replace("row.fec_registro || null", "row.FecRegistro || null")

# Also the docsAceptados rowCallback had: data.NroOrdenCompra + '|' + (data.TipoOc || '')
# Is that correct? Let's check docsAceptados structure. Yes, NroOrdenCompra and TipoOc.
with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Properties fixed.")
