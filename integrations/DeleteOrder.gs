function processDeletedOrder(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var orderIdToDelete = data.id;
    
    if (!orderIdToDelete) {
      return ContentService.createTextOutput("Error: No Order ID provided.");
    }

    var ordersSheet = openOrdersSheetByInput(data);
    
    var lastRow = ordersSheet.getLastRow();
    var rowToUpdate = -1;
    
    // Find the row with the matching Order ID
    if (lastRow > 1) {
      var existingIds = ordersSheet.getRange(2, 1, lastRow - 1, 1).getValues();
      for (var i = 0; i < existingIds.length; i++) {
        if (existingIds[i][0] == orderIdToDelete) {
          rowToUpdate = i + 2; // +2 because range starts at row 2
          break;
        }
      }
    }
    
    // If the order is found, update the Status (Column 3) to "deleted"
    if (rowToUpdate !== -1) {
      ordersSheet.getRange(rowToUpdate, 3).setValue("deleted");
      return ContentService.createTextOutput("Order " + orderIdToDelete + " successfully marked as deleted.");
    } else {
      return ContentService.createTextOutput("Error: Order not found in sheet.");
    }
    
  } catch (error) {
    console.error("Critical Delete Error: ", error);
    return ContentService.createTextOutput("Error processing deletion: " + error.message);
  }
}