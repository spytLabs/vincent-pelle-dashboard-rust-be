function doPost(e) {
  try {
    // Prefer URL query action for WP webhooks; fallback to JSON body action for app updates.
    var action = (e.parameter && e.parameter.action) ? String(e.parameter.action) : "";

    if (!action && e.postData && e.postData.contents) {
      try {
        var body = JSON.parse(e.postData.contents);
        action = body && body.action ? String(body.action) : "";
      } catch (_parseErr) {
        action = "";
      }
    }
    
    if (action === "upsert") {
      // Handles both "Order Created" and "Order Updated" webhooks
      return processAddOrUpdateOrder(e); 
    } 
    else if (action === "delete") {
      // Handles the "Order Deleted" webhook
      return processDeletedOrder(e); 
    }
    else if (action === "updateOrderFields") {
      return processUpdateOrderFields(e);
    }
    else if (action === "updateOrderStatus") {
      return processUpdateOrderStatus(e);
    } 
    else if (action === "getSheetData") {
      return processGetSheetData(e);
    }
    else if (action === "getOrderDetails") {
      return processGetOrderDetails(e);
    }
    else if (action === "updateOrderFieldsByOrderId") {
      return processUpdateOrderFieldsByOrderId(e);
    }
    else if (action === "updateOrderStatusByOrderId") {
      return processUpdateOrderStatusByOrderId(e);
    }
    else if (action === "fetchOrdersFast") {
      return processFetchOrdersFast(e);
    }
    else {
      return ContentService.createTextOutput("Error: No valid action specified in the URL.");
    }
  } catch (error) {
    return ContentService.createTextOutput("Router Error: " + error.message);
  }
}