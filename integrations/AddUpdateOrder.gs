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