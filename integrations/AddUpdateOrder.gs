function openOrdersSheetByInput(input) {
  var spreadsheetId = (input && input.spreadsheetId) || "1bjlF7TI7izjeY8-qKuXrfrCQZaDAW0wMWbv9rkPrtF0";
  var sheetName = (input && input.sheetName) || "Orders";
  var ss = SpreadsheetApp.openById(spreadsheetId);
  var ordersSheet = ss.getSheetByName(sheetName);

  if (!ordersSheet) {
    throw new Error("Sheet not found: " + sheetName);
  }

  return ordersSheet;
}

function jsonResponse(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON);
}

function normalizeHeaderName(value) {
  return String(value || "").toLowerCase().trim();
}

function findOrderIdColumnIndex(headers) {
  for (var i = 0; i < headers.length; i++) {
    var h = normalizeHeaderName(headers[i]);
    if (h === "id" || h === "order id" || h === "orderid") {
      return i;
    }
  }
  return -1;
}

function findStatusColumnIndex(headers) {
  for (var i = 0; i < headers.length; i++) {
    if (normalizeHeaderName(headers[i]) === "status") {
      return i;
    }
  }
  return -1;
}

function findWaybillColumnIndex(headers) {
  for (var i = 0; i < headers.length; i++) {
    var h = normalizeHeaderName(headers[i]);
    if (h === "waybilll_id" || h === "waybill_id" || h === "waybill id" || h === "waybillid") {
      return i;
    }
  }
  return -1;
}

function findOrderRowNumberById(ordersSheet, idColZeroBased, orderId) {
  var lastRow = ordersSheet.getLastRow();
  if (lastRow <= 1) {
    return -1;
  }

  var idValues = ordersSheet.getRange(2, idColZeroBased + 1, lastRow - 1, 1).getDisplayValues();
  var target = String(orderId || "").trim();

  for (var i = 0; i < idValues.length; i++) {
    if (String(idValues[i][0] || "").trim() === target) {
      return i + 2;
    }
  }

  return -1;
}

function findOrderRowNumberByIdCached(ordersSheet, idColZeroBased, orderId) {
  var target = String(orderId || "").trim();
  if (!target) {
    return -1;
  }

  var cache = CacheService.getScriptCache();
  var cacheKey = [
    ordersSheet.getParent().getId(),
    ordersSheet.getName(),
    "row",
    target
  ].join(":");

  var cachedRow = parseInt(cache.get(cacheKey), 10);
  if (!isNaN(cachedRow) && cachedRow > 1) {
    var current = String(ordersSheet.getRange(cachedRow, idColZeroBased + 1).getDisplayValue() || "").trim();
    if (current === target) {
      return cachedRow;
    }
  }

  var rowNumber = findOrderRowNumberById(ordersSheet, idColZeroBased, target);
  if (rowNumber > 1) {
    cache.put(cacheKey, String(rowNumber), 1800);
  }

  return rowNumber;
}

function getHeaderIndexMap(headers) {
  var map = {};
  for (var i = 0; i < headers.length; i++) {
    map[normalizeHeaderName(headers[i])] = i;
  }
  return map;
}

function findHeaderIndexByInput(headers, indexMap, inputHeader) {
  var exact = headers.indexOf(inputHeader);
  if (exact >= 0) {
    return exact;
  }
  var normalized = normalizeHeaderName(inputHeader);
  if (Object.prototype.hasOwnProperty.call(indexMap, normalized)) {
    return indexMap[normalized];
  }
  return -1;
}

function buildOrderDetailsResponse(orderId, headers, rowValues, actionName) {
  var statusIdx = findStatusColumnIndex(headers);
  var status = statusIdx >= 0 ? String(rowValues[statusIdx] || "") : "";

  return jsonResponse({
    success: true,
    action: actionName,
    orderId: String(orderId || ""),
    status: status,
    headers: headers,
    rowValues: rowValues,
  });
}

function processGetOrderDetails(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var ordersSheet = openOrdersSheetByInput(data);
    var orderId = String(data.orderId || "").trim();

    if (!orderId) {
      throw new Error("Missing orderId");
    }

    var lastCol = Math.max(1, Math.min(ordersSheet.getLastColumn(), 52));
    var headers = ordersSheet.getRange(1, 1, 1, lastCol).getDisplayValues()[0];
    var idIdx = findOrderIdColumnIndex(headers);
    if (idIdx < 0) {
      throw new Error("Could not find order id column");
    }

    var rowNumber = findOrderRowNumberByIdCached(ordersSheet, idIdx, orderId);
    if (rowNumber < 0) {
      throw new Error("Order id '" + orderId + "' not found");
    }

    var rowValues = ordersSheet.getRange(rowNumber, 1, 1, lastCol).getDisplayValues()[0];
    return buildOrderDetailsResponse(orderId, headers, rowValues, "getOrderDetails");
  } catch (error) {
    return ContentService.createTextOutput("Error processing get order details: " + error.message);
  }
}

function processUpdateOrderFieldsByOrderId(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var ordersSheet = openOrdersSheetByInput(data);
    var orderId = String(data.orderId || "").trim();
    var updates = data.updates || {};

    if (!orderId) {
      throw new Error("Missing orderId");
    }

    var lastCol = Math.max(1, Math.min(ordersSheet.getLastColumn(), 52));
    var headers = ordersSheet.getRange(1, 1, 1, lastCol).getDisplayValues()[0];
    var idIdx = findOrderIdColumnIndex(headers);
    if (idIdx < 0) {
      throw new Error("Could not find order id column");
    }

    var rowNumber = findOrderRowNumberByIdCached(ordersSheet, idIdx, orderId);
    if (rowNumber < 0) {
      throw new Error("Order id '" + orderId + "' not found");
    }

    var indexMap = getHeaderIndexMap(headers);
    var rowValues = ordersSheet.getRange(rowNumber, 1, 1, lastCol).getDisplayValues()[0];
    var keys = Object.keys(updates);
    var changed = false;

    for (var i = 0; i < keys.length; i++) {
      var header = keys[i];
      var val = String(updates[header] == null ? "" : updates[header]);
      var idx = findHeaderIndexByInput(headers, indexMap, header);

      if (idx >= 0) {
        rowValues[idx] = val;
        changed = true;
      }
    }

    if (changed) {
      ordersSheet.getRange(rowNumber, 1, 1, lastCol).setValues([rowValues]);
    }

    return buildOrderDetailsResponse(orderId, headers, rowValues, "updateOrderFieldsByOrderId");
  } catch (error) {
    return ContentService.createTextOutput("Error processing update by order id: " + error.message);
  }
}

function processUpdateOrderStatusByOrderId(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var ordersSheet = openOrdersSheetByInput(data);
    var orderId = String(data.orderId || "").trim();
    var status = String(data.status || "");
    var waybillId = data.waybillId == null ? "" : String(data.waybillId);

    if (!orderId) {
      throw new Error("Missing orderId");
    }

    var lastCol = Math.max(1, Math.min(ordersSheet.getLastColumn(), 52));
    var headers = ordersSheet.getRange(1, 1, 1, lastCol).getDisplayValues()[0];
    var idIdx = findOrderIdColumnIndex(headers);
    if (idIdx < 0) {
      throw new Error("Could not find order id column");
    }

    var rowNumber = findOrderRowNumberByIdCached(ordersSheet, idIdx, orderId);
    if (rowNumber < 0) {
      throw new Error("Order id '" + orderId + "' not found");
    }

    var statusIdx = findStatusColumnIndex(headers);
    if (statusIdx < 0) {
      throw new Error("Could not find status column");
    }
    var rowValues = ordersSheet.getRange(rowNumber, 1, 1, lastCol).getDisplayValues()[0];
    rowValues[statusIdx] = status;

    if (waybillId) {
      var wIdx = findWaybillColumnIndex(headers);
      if (wIdx >= 0) {
        rowValues[wIdx] = waybillId;
      }
    }

    ordersSheet.getRange(rowNumber, 1, 1, lastCol).setValues([rowValues]);

    return buildOrderDetailsResponse(orderId, headers, rowValues, "updateOrderStatusByOrderId");
  } catch (error) {
    return ContentService.createTextOutput("Error processing status update by order id: " + error.message);
  }
}

function processFetchOrdersFast(e) {
  try {
    var data = {};
    if (e.postData && e.postData.contents) {
      data = JSON.parse(e.postData.contents);
    }

    var ordersSheet = openOrdersSheetByInput(data);
    var lastRow = ordersSheet.getLastRow();
    var lastCol = Math.max(1, Math.min(ordersSheet.getLastColumn(), 52));
    var headers = ordersSheet.getRange(1, 1, 1, lastCol).getDisplayValues()[0];
    var indexMap = getHeaderIndexMap(headers);

    if (lastRow <= 1) {
      return jsonResponse({ success: true, action: "fetchOrdersFast", orders: [] });
    }

    var rows = ordersSheet.getRange(2, 1, lastRow - 1, lastCol).getDisplayValues();

    var idx = {
      id: indexMap["order id"] != null ? indexMap["order id"] : indexMap["id"],
      order_number: indexMap["order number"],
      status: indexMap["status"],
      date_created: indexMap["date created"],
      customer_name: indexMap["customer name"],
      email: indexMap["email"],
      phone: indexMap["phone"],
      whatsapp: indexMap["whatsapp"],
      address_line1: indexMap["address line 1"],
      address_line2: indexMap["address line 2"],
      city: indexMap["city"],
      state: indexMap["state"],
      postcode: indexMap["postcode"],
      district: indexMap["district"],
      items_summary: indexMap["items summary"],
      shipping: indexMap["shipping"],
      total: indexMap["total"],
      customer_note: indexMap["customer note"],
      payment_method: indexMap["payment method"]
    };

    function pick(row, i) {
      return (i != null && i >= 0 && i < row.length) ? String(row[i] || "") : "";
    }

    var orders = [];
    for (var r = 0; r < rows.length; r++) {
      var row = rows[r];
      var st = pick(row, idx.status).toLowerCase().trim();
      if (st !== "processing" && st !== "sent-to-koombiyo") {
        continue;
      }

      orders.push({
        id: pick(row, idx.id),
        orderNumber: pick(row, idx.order_number),
        status: pick(row, idx.status),
        dateCreated: pick(row, idx.date_created),
        customerName: pick(row, idx.customer_name),
        email: pick(row, idx.email),
        phone: pick(row, idx.phone),
        whatsapp: pick(row, idx.whatsapp),
        addressLine1: pick(row, idx.address_line1),
        addressLine2: pick(row, idx.address_line2),
        city: pick(row, idx.city),
        state: pick(row, idx.state),
        postcode: pick(row, idx.postcode),
        district: pick(row, idx.district),
        itemsSummary: pick(row, idx.items_summary),
        shipping: pick(row, idx.shipping),
        total: pick(row, idx.total),
        customerNote: pick(row, idx.customer_note),
        paymentMethod: pick(row, idx.payment_method)
      });
    }

    return jsonResponse({
      success: true,
      action: "fetchOrdersFast",
      orders: orders
    });
  } catch (error) {
    return ContentService.createTextOutput("Error processing fast order fetch: " + error.message);
  }
}

function processUpdateOrderFields(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var ordersSheet = openOrdersSheetByInput(data);
    var updates = data.updates || [];

    for (var i = 0; i < updates.length; i++) {
      var update = updates[i] || {};
      var range = String(update.range || "");
      var values = update.values || [[""]];

      if (range.indexOf("!") !== -1) {
        range = range.split("!")[1];
      }

      if (!range) {
        continue;
      }

      ordersSheet.getRange(range).setValues(values);
    }

    return jsonResponse({
      success: true,
      action: "updateOrderFields",
      orderId: data.orderId || "",
    });
  } catch (error) {
    return ContentService.createTextOutput("Error processing field update: " + error.message);
  }
}

function processUpdateOrderStatus(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var ordersSheet = openOrdersSheetByInput(data);
    var range = String(data.range || "");
    var status = String(data.status || "");

    if (range.indexOf("!") !== -1) {
      range = range.split("!")[1];
    }

    if (!range) {
      throw new Error("Missing range for updateOrderStatus action");
    }

    ordersSheet.getRange(range).setValue(status);

    return jsonResponse({
      success: true,
      action: "updateOrderStatus",
      orderId: data.orderId || "",
      status: status,
    });
  } catch (error) {
    return ContentService.createTextOutput("Error processing status update: " + error.message);
  }
}

function processGetSheetData(e) {
  try {
    var data = {};

    if (e.postData && e.postData.contents) {
      data = JSON.parse(e.postData.contents);
    }

    var ordersSheet = openOrdersSheetByInput(data);
    var lastRow = ordersSheet.getLastRow();
    var lastCol = ordersSheet.getLastColumn();

    // Keep reads bounded to A:AZ to match backend expectations and avoid
    // expensive scans caused by formatting in distant columns.
    var readCols = Math.max(1, Math.min(lastCol, 52));
    var readRows = Math.max(1, lastRow);
    var values = ordersSheet.getRange(1, 1, readRows, readCols).getDisplayValues();

    return jsonResponse({
      success: true,
      action: "getSheetData",
      values: values,
    });
  } catch (error) {
    return ContentService.createTextOutput("Error processing sheet read: " + error.message);
  }
}

function processAddOrUpdateOrder(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var ordersSheet = openOrdersSheetByInput(data);
    var orderId = data.id;

    // 1. Prepare all the data extracted from the webhook
    var itemsSummary = (data.line_items || []).map(function (item) {
      return item.name + " (Qty: " + item.quantity + ")";
    }).join(" | ");

    var productIds = "'" + (data.line_items || []).map(function (item) {
      return item.product_id;
    }).join(", ");

    var metaData = {};
    (data.meta_data || []).forEach(function (meta) {
      metaData[meta.key] = meta.value;
    });

    var whatsappNumber = metaData["whatsapp_number"] || "";
    var district = metaData["district"] || "N/A";

    var billing = data.billing || {};
    var shipping = data.shipping || {};
    var customerName = (billing.first_name || "") + " " + (billing.last_name || "");

    // 2. Check if the order already exists in the sheet
    var lastRow = ordersSheet.getLastRow();
    var targetRow = -1;

    if (lastRow > 1) {
      var existingIds = ordersSheet.getRange(2, 1, lastRow - 1, 1).getValues();
      for (var i = 0; i < existingIds.length; i++) {
        if (existingIds[i][0] == orderId) {
          targetRow = i + 2; // +2 because range starts at row 2
          break;
        }
      }
    }

    var isUpdate = (targetRow !== -1);

    // 3. Set default values for NEW orders
    var waybillId = "";
    var feedbackMsgSent = "no";

    // 4. If UPDATING, grab the current sheet values to keep them intact
    if (isUpdate) {
      // Column 20 is waybill_id
      waybillId = ordersSheet.getRange(targetRow, 20).getValue();
      // Column 22 is feedback_msg_sent
      feedbackMsgSent = ordersSheet.getRange(targetRow, 22).getValue();
    }

    // 5. Construct the row array
    var rowData = [
      data.id,
      data.number,
      data.status,
      data.date_created,
      customerName,
      billing.email || "",
      billing.phone || "",
      whatsappNumber,
      shipping.address_1 || "",
      shipping.address_2 || "",
      shipping.city || "",
      shipping.state || "",
      shipping.postcode || "",
      district,
      itemsSummary,
      data.shipping_total || 0,
      data.total || 0,
      data.customer_note || "",
      data.payment_method_title || "",
      waybillId,       // Uses existing sheet value if updating
      productIds,
      feedbackMsgSent  // Uses existing sheet value if updating
    ];

    // 6. Write data to the sheet (Update or Append)
    if (isUpdate) {
      // Overwrite the specific row with the updated data + preserved manual data
      ordersSheet.getRange(targetRow, 1, 1, rowData.length).setValues([rowData]);
    } else {
      // Add a totally new row
      ordersSheet.appendRow(rowData);
    }


    return ContentService.createTextOutput(isUpdate ? "Order updated" : "Order added");

  } catch (error) {
    console.error("Critical Add/Update Error: ", error);
    return ContentService.createTextOutput("Error processing request: " + error.message);
  }
}