/**
 * Dvand Waitlist Email Collection Script - Enhanced Version
 * Handles form submissions with advanced features
 */

// ===========================================
// CONFIGURATION
// ===========================================

// Replace with your actual Google Sheet ID
const SHEET_ID = '1oWrijV7VpsDb-4RGq-jWJIFESXYajqIJ3PjxFIPuP_0';

// Replace with your notification email (optional)
const NOTIFICATION_EMAIL = 'aryan@dvand.in';

// Enable/disable features
const FEATURES = {
  emailNotifications: true,
  duplicateChecking: true,
  spamProtection: true,
  analytics: true,
  rateLimiting: true
};

// ===========================================
// MAIN HANDLERS
// ===========================================

function doPost(e) {
  try {
    // Parse incoming data
    const requestData = JSON.parse(e.postData.contents);
    
    // Rate limiting check
    if (FEATURES.rateLimiting && isRateLimited(requestData.email)) {
      return createResponse(false, 'Too many requests. Please try again later.');
    }
    
    // Validate email format
    if (!isValidEmail(requestData.email)) {
      return createResponse(false, 'Invalid email format');
    }
    
    // Spam protection
    if (FEATURES.spamProtection && isLikelySpam(requestData.email, requestData.userAgent)) {
      return createResponse(false, 'Please use a valid email address');
    }
    
    // Get spreadsheet
    const spreadsheet = SpreadsheetApp.openById(SHEET_ID);
    const sheet = spreadsheet.getActiveSheet();
    
    // Check for duplicates
    if (FEATURES.duplicateChecking) {
      const duplicateCheck = checkDuplicate(requestData.email.toLowerCase().trim(), sheet);
      if (duplicateCheck.isDuplicate) {
        return createResponse(false, 
          `Email already registered on ${duplicateCheck.originalSignupDate.toDateString()}`);
      }
    }
    
    // Prepare data
    const timestamp = new Date();
    const email = requestData.email.toLowerCase().trim();
    const source = requestData.source || 'dvand-waitlist';
    const userAgent = requestData.userAgent || 'Unknown';
    const referrer = requestData.referrer || 'direct';
    const screenRes = requestData.screenResolution || 'unknown';
    const timezone = requestData.timezone || 'unknown';
    
    // Add to sheet
    sheet.appendRow([
      timestamp,
      email,
      source,
      userAgent,
      referrer,
      screenRes,
      timezone
    ]);
    
    // Send notification email
    if (FEATURES.emailNotifications && NOTIFICATION_EMAIL) {
      sendNotificationEmail(email, getSignupCount(sheet));
    }
    
    // Log success
    console.log(`New signup: ${email} at ${timestamp}`);
    
    // Track analytics
    if (FEATURES.analytics) {
      logAnalytics('signup', email, requestData);
    }
    
    return createResponse(true, 'Successfully added to waitlist', {
      email: email,
      signupNumber: getSignupCount(sheet)
    });
    
  } catch (error) {
    console.error('Error processing form submission:', error);
    return createResponse(false, 'Server error occurred');
  }
}

function doGet(e) {
  try {
    const action = e.parameter.action;
    
    switch (action) {
      case 'stats':
        return getStats();
      case 'export':
        return exportData();
      case 'health':
        return createResponse(true, 'API is healthy');
      default:
        return createResponse(true, 'Dvand Waitlist API is running');
    }
  } catch (error) {
    console.error('Error in doGet:', error);
    return createResponse(false, 'Server error occurred');
  }
}

// ===========================================
// UTILITY FUNCTIONS
// ===========================================

function createResponse(success, message, data = null) {
  const response = {
    success: success,
    message: message,
    timestamp: new Date().toISOString()
  };
  
  if (data) {
    response.data = data;
  }
  
  return ContentService
    .createTextOutput(JSON.stringify(response))
    .setMimeType(ContentService.MimeType.JSON);
}

function getAllowedOrigin() {
  // Configuration - Update this as needed
  const PRODUCTION_MODE = false; // Set to false for testing
  const ALLOW_HTTP_DURING_TRANSITION = true; // Set to false once HTTPS is ready
  
  if (!PRODUCTION_MODE) {
    // Development mode - allow all origins
    return '*';
  }
  
  // Production mode - restrict to your domains
  if (ALLOW_HTTP_DURING_TRANSITION) {
    // During HTTPS transition - allow both HTTP and HTTPS
    return 'https://dvand.in'; // Primary domain
    // Note: Apps Script can't dynamically check origin, so we return primary
  } else {
    // Full production - HTTPS only
    return 'https://dvand.in';
  }
}

function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

function isLikelySpam(email, userAgent) {
  // Email patterns that are commonly spam
  const spamPatterns = [
    /temp.*mail/i,
    /disposable/i,
    /throwaway/i,
    /10minute/i,
    /guerrilla.*mail/i,
    /mailinator/i,
    /test.*test/i,
    /example\.com/i,
    /fake.*mail/i
  ];
  
  // Check email patterns
  for (let pattern of spamPatterns) {
    if (pattern.test(email)) return true;
  }
  
  // ✅ RELAXED: Only block if completely missing user agent
  // Removed the strict length check that was blocking legitimate users
  if (!userAgent) {
    return true;
  }
  
  // Check for obvious bot patterns in user agent
  const botPatterns = [/bot/i, /crawl/i, /spider/i, /scrape/i];
  for (let pattern of botPatterns) {
    if (pattern.test(userAgent)) return true;
  }
  
  return false;
}

function checkDuplicate(email, sheet) {
  const emailColumn = sheet.getRange('B:B').getValues().flat();
  const duplicateIndex = emailColumn.indexOf(email);
  
  if (duplicateIndex > 0) { // Index 0 is header
    const signupDate = sheet.getRange(duplicateIndex + 1, 1).getValue();
    return {
      isDuplicate: true,
      originalSignupDate: signupDate
    };
  }
  
  return { isDuplicate: false };
}

function getSignupCount(sheet = null) {
  if (!sheet) {
    sheet = SpreadsheetApp.openById(SHEET_ID).getActiveSheet();
  }
  return sheet.getLastRow() - 1; // Subtract header row
}

function sendNotificationEmail(email, totalSignups) {
  try {
    const subject = `New Dvand Waitlist Signup (#${totalSignups})`;
    const body = `
New signup details:
Email: ${email}
Signup #: ${totalSignups}
Time: ${new Date()}

View all signups: https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit
    `;
    
    MailApp.sendEmail({
      to: NOTIFICATION_EMAIL,
      subject: subject,
      body: body
    });
  } catch (error) {
    console.error('Failed to send notification email:', error);
  }
}

function getStats() {
  try {
    const sheet = SpreadsheetApp.openById(SHEET_ID).getActiveSheet();
    const totalSignups = getSignupCount(sheet);
    
    // Get today's signups
    const today = new Date();
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    
    const data = sheet.getDataRange().getValues();
    const todaySignups = data.filter(row => {
      if (row[0] instanceof Date) {
        return row[0] >= todayStart;
      }
      return false;
    }).length;
    
    // Get last signup info
    let lastSignup = null;
    if (totalSignups > 0) {
      const lastRow = sheet.getRange(sheet.getLastRow(), 1, 1, 2).getValues()[0];
      lastSignup = {
        timestamp: lastRow[0],
        email: lastRow[1]
      };
    }
    
    return createResponse(true, 'Stats retrieved', {
      totalSignups: totalSignups,
      todaySignups: todaySignups,
      lastSignup: lastSignup
    });
    
  } catch (error) {
    console.error('Error getting stats:', error);
    return createResponse(false, 'Failed to get stats');
  }
}

function exportData() {
  try {
    const sheet = SpreadsheetApp.openById(SHEET_ID).getActiveSheet();
    const data = sheet.getDataRange().getValues();
    
    // Convert to CSV
    let csv = '';
    data.forEach(row => {
      csv += row.map(cell => {
        // Handle dates and strings with commas
        if (cell instanceof Date) {
          return cell.toISOString();
        } else if (typeof cell === 'string' && cell.includes(',')) {
          return `"${cell}"`;
        }
        return cell;
      }).join(',') + '\n';
    });
    
    return createResponse(true, 'Data exported', {
      csv: csv,
      totalRecords: data.length - 1 // Subtract header
    });
    
  } catch (error) {
    console.error('Error exporting data:', error);
    return createResponse(false, 'Failed to export data');
  }
}

function isRateLimited(email) {
  try {
    // Simple rate limiting: max 3 attempts per email per hour
    const cache = CacheService.getScriptCache();
    const key = `rate_limit_${email}`;
    const attempts = cache.get(key);
    
    if (attempts && parseInt(attempts) >= 3) {
      return true;
    }
    
    // Increment attempts
    const newAttempts = attempts ? parseInt(attempts) + 1 : 1;
    cache.put(key, newAttempts.toString(), 3600); // 1 hour cache
    
    return false;
  } catch (error) {
    console.error('Rate limiting error:', error);
    return false; // If cache fails, don't block
  }
}

function logAnalytics(event, email, data) {
  try {
    // Log to a separate analytics sheet or external service
    // For now, just console log
    console.log(`Analytics - ${event}:`, {
      email: email,
      timestamp: new Date(),
      userAgent: data.userAgent,
      referrer: data.referrer,
      screenResolution: data.screenResolution
    });
  } catch (error) {
    console.error('Analytics logging error:', error);
  }
}

// ===========================================
// TESTING AND MAINTENANCE FUNCTIONS
// ===========================================

function testSubmission() {
  const testData = {
    email: 'test@example.com',
    source: 'test',
    userAgent: 'Test Browser',
    referrer: 'test',
    screenResolution: '1920x1080',
    timezone: 'UTC'
  };
  
  const mockEvent = {
    postData: {
      contents: JSON.stringify(testData)
    }
  };
  
  const result = doPost(mockEvent);
  console.log('Test result:', result.getContent());
}

function setupSheet() {
  try {
    const spreadsheet = SpreadsheetApp.openById(SHEET_ID);
    const sheet = spreadsheet.getActiveSheet();
    
    // Set up headers if not exists
    const headers = ['Timestamp', 'Email', 'Source', 'User Agent', 'Referrer', 'Screen Resolution', 'Timezone'];
    const firstRow = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
    
    if (firstRow[0] !== 'Timestamp') {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      
      // Format the header row
      const headerRange = sheet.getRange(1, 1, 1, headers.length);
      headerRange.setFontWeight('bold');
      headerRange.setBackground('#667eea');
      headerRange.setFontColor('white');
    }
    
    console.log('Sheet setup completed');
  } catch (error) {
    console.error('Sheet setup error:', error);
  }
}

function getEmailList() {
  try {
    const sheet = SpreadsheetApp.openById(SHEET_ID).getActiveSheet();
    const emailColumn = sheet.getRange('B:B').getValues().flat();
    
    // Remove header and empty cells
    const emails = emailColumn.slice(1).filter(email => email && email.trim() !== '');
    
    console.log(`Total emails: ${emails.length}`);
    return emails;
  } catch (error) {
    console.error('Error getting email list:', error);
    return [];
  }
}