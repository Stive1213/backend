const { db } = require('../config/db');
const { GoogleGenerativeAI } = require('@google/generative-ai');

      // Helper function to call Gemini REST API directly
async function callGeminiRestApi(modelName, prompt, apiKey) {
  const globalFetch = typeof fetch !== 'undefined' ? fetch : require('node-fetch');
  
  // Try v1 first, then v1beta
  const apiVersions = ['v1', 'v1beta'];
  
  for (const version of apiVersions) {
    try {
      const url = `https://generativelanguage.googleapis.com/${version}/models/${modelName}:generateContent?key=${apiKey}`;
      const response = await globalFetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: prompt
            }]
          }]
        })
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.candidates && data.candidates[0] && data.candidates[0].content) {
          return data.candidates[0].content.parts[0].text;
        }
      } else {
        const errorData = await response.json().catch(() => ({}));
        console.log(`API version ${version} returned ${response.status}:`, errorData);
      }
    } catch (e) {
      console.log(`API version ${version} failed for ${modelName}:`, e.message);
      continue;
    }
  }
  throw new Error('All API versions failed');
}

// Helper function to parse actionable items from AI response
function parseActionableItems(aiResponse) {
  let actionableItems = null;
  let cleanResponse = aiResponse;
  
  // Extract JSON from <ACTIONABLE_ITEMS> tags
  const actionableMatch = aiResponse.match(/<ACTIONABLE_ITEMS>([\s\S]*?)<\/ACTIONABLE_ITEMS>/);
  if (actionableMatch) {
    try {
      actionableItems = JSON.parse(actionableMatch[1].trim());
      // Remove the actionable items section from the response text
      cleanResponse = aiResponse.replace(/<ACTIONABLE_ITEMS>[\s\S]*?<\/ACTIONABLE_ITEMS>/, '').trim();
      console.log('Found actionable items:', JSON.stringify(actionableItems, null, 2));
    } catch (parseError) {
      console.error('Failed to parse actionable items:', parseError);
      // Continue without actionable items if parsing fails
    }
  }
  
  return { cleanResponse, actionableItems };
}

// Helper function to try available models
async function tryAvailableModels(listData, prompt, apiKey, res) {
  if (listData.models && listData.models.length > 0) {
    const availableModels = listData.models
      .filter(m => m.supportedGenerationMethods && m.supportedGenerationMethods.includes('generateContent'))
      .map(m => m.name.replace('models/', ''));
    
    console.log('Available models that support generateContent:', availableModels);
    
    if (availableModels.length === 0) {
      throw new Error('No models found that support generateContent');
    }
    
    // Try each available model using REST API
    for (const workingModelName of availableModels) {
      try {
        console.log(`Trying model via REST API: ${workingModelName}`);
              const response = await callGeminiRestApi(workingModelName, prompt, apiKey);
              if (response) {
                const { cleanResponse, actionableItems } = parseActionableItems(response);
                return res.json({ 
                  response: cleanResponse, 
                  tips: [],
                  actionableItems: actionableItems
                });
              }
      } catch (modelError) {
        console.log(`Model ${workingModelName} failed:`, modelError.message);
        continue;
      }
    }
  }
  throw new Error('No working models found');
}

// Helper function to try direct REST API with common models
async function tryDirectRestApi(prompt, apiKey, res) {
  const commonModels = ['gemini-pro', 'gemini-1.0-pro', 'gemini-1.5-flash', 'gemini-1.5-pro'];
  
  for (const modelName of commonModels) {
    try {
      console.log(`Trying direct REST API call with model: ${modelName}`);
            const response = await callGeminiRestApi(modelName, prompt, apiKey);
            if (response) {
              const { cleanResponse, actionableItems } = parseActionableItems(response);
              return res.json({ 
                response: cleanResponse, 
                tips: [],
                actionableItems: actionableItems
              });
            }
    } catch (modelError) {
      console.log(`Model ${modelName} failed:`, modelError.message);
      continue;
    }
  }
  throw new Error(`None of the common models worked. Please check your API key in Google AI Studio.`);
}

const getAssistantResponse = async (req, res) => {
  const { question } = req.body;
  if (!question) return res.status(400).json({ error: 'Question is required' });

  const lowerQuestion = question.toLowerCase();
  const userId = req.user.id;

  // Helper function to get current date parts
  const now = new Date();
  const today = now.toISOString().split('T')[0]; // e.g., "2025-04-08"
  const currentMonth = today.slice(0, 7); // e.g., "2025-04"

  try {
    let userData = {};
    let contextData = '';

    // Detect what type of data the user is asking about and fetch relevant data
    if (lowerQuestion.includes('expense') || lowerQuestion.includes('spending') || 
        lowerQuestion.includes('budget') || lowerQuestion.includes('money') ||
        lowerQuestion.includes('transaction') || lowerQuestion.includes('cost')) {
      // Fetch expense/transaction data
      await new Promise((resolve, reject) => {
        db.all('SELECT * FROM transactions WHERE user_id = ? ORDER BY date DESC LIMIT 50', [userId], (err, transactions) => {
          if (err) return reject(err);
          userData.transactions = transactions;
          const expenses = transactions.filter(t => t.type === 'expense');
          const income = transactions.filter(t => t.type === 'income');
          const totalExpenses = expenses.reduce((sum, t) => sum + t.amount, 0);
          const totalIncome = income.reduce((sum, t) => sum + t.amount, 0);
          const monthlyExpenses = expenses.filter(t => t.date.startsWith(currentMonth)).reduce((sum, t) => sum + t.amount, 0);
          
          if (transactions.length === 0) {
            contextData = `User's Financial Data:
- No transactions recorded yet.
- The user is asking about expenses, but they haven't logged any transactions.`;
          } else {
            contextData = `User's Financial Data:
- Total Expenses: $${totalExpenses.toFixed(2)}
- Total Income: $${totalIncome.toFixed(2)}
- Monthly Expenses (${currentMonth}): $${monthlyExpenses.toFixed(2)}
- Recent Transactions (last 50):
${transactions.slice(0, 20).map(t => `  - ${t.date}: ${t.type} of $${t.amount} in ${t.category}${t.description ? ` (${t.description})` : ''}`).join('\n')}
- Expense Categories Breakdown:
${Object.entries(expenses.reduce((acc, t) => {
  acc[t.category] = (acc[t.category] || 0) + t.amount;
  return acc;
}, {})).map(([cat, amt]) => `  - ${cat}: $${amt.toFixed(2)}`).join('\n')}`;
          }
          resolve();
        });
      });
    } else if (lowerQuestion.includes('task') || lowerQuestion.includes('todo') || 
               lowerQuestion.includes('what should i do') || lowerQuestion.includes('work')) {
      // Fetch task data
      await new Promise((resolve, reject) => {
        db.all('SELECT * FROM tasks WHERE user_id = ? ORDER BY deadline ASC', [userId], (err, tasks) => {
          if (err) return reject(err);
          userData.tasks = tasks;
          const todayTasks = tasks.filter(t => t.deadline === today);
          const upcomingTasks = tasks.filter(t => t.deadline > today && !t.isDone);
          const completedTasks = tasks.filter(t => t.isDone);
          
          contextData = `User's Task Data:
- Total Tasks: ${tasks.length}
- Tasks Today: ${todayTasks.length}
- Upcoming Tasks: ${upcomingTasks.length}
- Completed Tasks: ${completedTasks.length}
- Today's Tasks:
${todayTasks.map(t => `  - ${t.title}${t.category ? ` (${t.category})` : ''}${t.isDone ? ' [DONE]' : ' [PENDING]'}`).join('\n')}
- Upcoming Tasks:
${upcomingTasks.slice(0, 10).map(t => `  - ${t.title} (Due: ${t.deadline})${t.category ? ` [${t.category}]` : ''}`).join('\n')}`;
          resolve();
        });
      });
    } else if (lowerQuestion.includes('goal') || lowerQuestion.includes('objective') || 
               lowerQuestion.includes('target')) {
      // Fetch goal data
      await new Promise((resolve, reject) => {
    db.all('SELECT * FROM goals WHERE user_id = ?', [userId], (err, goals) => {
          if (err) return reject(err);
          userData.goals = goals;
      const activeGoals = goals.filter(g => g.progress < 100);
          const completedGoals = goals.filter(g => g.progress >= 100);
          
          contextData = `User's Goal Data:
- Total Goals: ${goals.length}
- Active Goals: ${activeGoals.length}
- Completed Goals: ${completedGoals.length}
- Active Goals:
${activeGoals.map(g => `  - ${g.title}: ${g.progress}% complete${g.deadline ? ` (Deadline: ${g.deadline})` : ''}${g.target ? ` [Target: ${g.target}]` : ''}`).join('\n')}
- Completed Goals:
${completedGoals.map(g => `  - ${g.title} (100% complete)`).join('\n')}`;
          resolve();
        });
      });
    } else if (lowerQuestion.includes('habit') || lowerQuestion.includes('routine')) {
      // Fetch habit data
      await new Promise((resolve, reject) => {
        db.all('SELECT * FROM habits WHERE user_id = ?', [userId], (err, habits) => {
          if (err) return reject(err);
          userData.habits = habits;
          const activeHabits = habits.filter(h => h.streak > 0);
          
          contextData = `User's Habit Data:
- Total Habits: ${habits.length}
- Active Habits (with streaks): ${activeHabits.length}
- Habits:
${habits.map(h => `  - ${h.name}: ${h.frequency}, Current Streak: ${h.streak} days`).join('\n')}`;
          resolve();
        });
      });
    } else if (lowerQuestion.includes('journal') || lowerQuestion.includes('mood') || 
               lowerQuestion.includes('entry') || lowerQuestion.includes('feeling')) {
      // Fetch journal data
      await new Promise((resolve, reject) => {
        db.all('SELECT * FROM journal_entries WHERE user_id = ? ORDER BY date DESC LIMIT 30', [userId], (err, entries) => {
          if (err) return reject(err);
          userData.journalEntries = entries;
          const todayEntry = entries.find(e => e.date === today);
          const recentEntries = entries.slice(0, 10);
          
          contextData = `User's Journal Data:
- Total Entries: ${entries.length}
- Today's Entry: ${todayEntry ? `Mood: ${todayEntry.mood}, Text: ${todayEntry.text.substring(0, 200)}...` : 'No entry today'}
- Recent Entries:
${recentEntries.map(e => `  - ${e.date}: Mood: ${e.mood}, ${e.text.substring(0, 100)}...`).join('\n')}
- Mood Distribution:
${Object.entries(entries.reduce((acc, e) => {
  acc[e.mood] = (acc[e.mood] || 0) + 1;
  return acc;
}, {})).map(([mood, count]) => `  - ${mood}: ${count} entries`).join('\n')}`;
          resolve();
        });
      });
    } else if (lowerQuestion.includes('event') || lowerQuestion.includes('calendar') || 
               lowerQuestion.includes('schedule') || lowerQuestion.includes('appointment')) {
      // Fetch event data
      await new Promise((resolve, reject) => {
        db.all('SELECT * FROM events WHERE user_id = ? ORDER BY date ASC, time ASC', [userId], (err, events) => {
          if (err) return reject(err);
          userData.events = events;
          const todayEvents = events.filter(e => e.date === today);
          const upcomingEvents = events.filter(e => e.date >= today).slice(0, 10);
          
          contextData = `User's Event Data:
- Total Events: ${events.length}
- Events Today: ${todayEvents.length}
- Today's Events:
${todayEvents.map(e => `  - ${e.title} at ${e.time}`).join('\n')}
- Upcoming Events:
${upcomingEvents.map(e => `  - ${e.title} on ${e.date} at ${e.time}`).join('\n')}`;
          resolve();
        });
      });
    } else {
      // General question - fetch a summary of all data
      await new Promise((resolve, reject) => {
        Promise.all([
          new Promise((res, rej) => {
            db.all('SELECT COUNT(*) as count FROM tasks WHERE user_id = ? AND isDone = 0', [userId], (err, rows) => {
              if (err) return rej(err);
              userData.pendingTasks = rows[0]?.count || 0;
              res();
            });
          }),
          new Promise((res, rej) => {
            db.all('SELECT COUNT(*) as count FROM goals WHERE user_id = ? AND progress < 100', [userId], (err, rows) => {
              if (err) return rej(err);
              userData.activeGoals = rows[0]?.count || 0;
              res();
            });
          }),
          new Promise((res, rej) => {
            db.all('SELECT SUM(amount) as total FROM transactions WHERE user_id = ? AND type = "expense" AND date LIKE ?', 
              [userId, `${currentMonth}%`], (err, rows) => {
              if (err) return rej(err);
              userData.monthlyExpenses = rows[0]?.total || 0;
              res();
            });
          }),
          new Promise((res, rej) => {
            db.all('SELECT COUNT(*) as count FROM habits WHERE user_id = ? AND streak > 0', [userId], (err, rows) => {
              if (err) return rej(err);
              userData.activeHabits = rows[0]?.count || 0;
              res();
            });
          })
        ]).then(() => {
          contextData = `User's General Data Summary:
- Pending Tasks: ${userData.pendingTasks}
- Active Goals: ${userData.activeGoals}
- Monthly Expenses: $${(userData.monthlyExpenses || 0).toFixed(2)}
- Active Habits: ${userData.activeHabits}`;
          resolve();
        }).catch(reject);
      });
    }

    // Prepare the prompt for Gemini AI
    const prompt = `You are a helpful life management assistant. A user is asking you a question about their personal data. 

${contextData}

User's Question: "${question}"

Please provide a helpful, personalized response based on the user's data above. Be conversational, supportive, and provide actionable advice when relevant. Keep your response concise but informative (2-4 sentences typically, but can be longer if needed for detailed analysis).

IMPORTANT: If the user is asking for a plan, tasks, habits, or goals that should be created, please include a JSON structure at the end of your response (after your text response) in this exact format:
<ACTIONABLE_ITEMS>
{
  "tasks": [
    {"title": "Task name", "deadline": "YYYY-MM-DD", "category": "category name"}
  ],
  "habits": [
    {"name": "Habit name", "frequency": "daily"}
  ],
  "goals": [
    {"title": "Goal name", "target": "target description", "deadline": "YYYY-MM-DD"}
  ]
}
</ACTIONABLE_ITEMS>

Only include items that the user explicitly wants to create or that are clearly part of a plan they're requesting. If no items should be created, omit the <ACTIONABLE_ITEMS> section entirely.`;

    // Initialize Gemini AI (with fallback to provided key)
    const apiKey = process.env.GEMINI_API_KEY || 'AIzaSyBPrFD1oX9Dpu3DwPrWYeuFk6xh6HcgNGs';
    
    if (!apiKey) {
      throw new Error('Gemini API key is not configured');
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    
    // Try to list available models first (for debugging)
    let availableModels = [];
    try {
      // Note: ListModels might not be available in all SDK versions, so we'll try-catch it
      console.log('Checking available models...');
    } catch (listError) {
      console.log('Could not list models:', listError.message);
    }
    
    // For free tier API, the model name might need to be just "gemini-pro"
    // Try multiple common free tier model names
    const freeTierModels = [
      'gemini-pro',           // Most common free tier model
      'gemini-1.0-pro',       // Versioned free tier model  
      'gemini-1.5-flash',     // Flash model (if available in free tier)
    ];
    
    let model;
    let modelName = null;
    let modelError = null;
    
    // Try each model name - we'll test them during the actual API call
    for (const testModelName of freeTierModels) {
      try {
        model = genAI.getGenerativeModel({ model: testModelName });
        modelName = testModelName;
        console.log(`Initialized model: ${testModelName}`);
        break; // Use the first one that initializes
      } catch (initError) {
        modelError = initError;
        console.log(`Model ${testModelName} initialization failed: ${initError.message}`);
        continue;
      }
    }
    
    if (!model || !modelName) {
      throw new Error(`Could not initialize any Gemini model. Tried: ${freeTierModels.join(', ')}. Please verify your API key is valid for the free tier.`);
    }

    // Generate response
    console.log('Sending request to Gemini AI...');
    console.log('API Key present:', !!apiKey);
    console.log('Prompt length:', prompt.length);
    console.log('Using model:', modelName);
    
    try {
      // Try to generate content - if model name is wrong, we'll catch it here
      const result = await model.generateContent(prompt);
      const response = await result.response;
      
      // Extract text from response - response.text() is a method
      let aiResponse;
      try {
        // Standard way to get text from Gemini response
        aiResponse = response.text();
      } catch (textError) {
        // Fallback: try to extract from candidates if text() method fails
        console.log('text() method failed, trying alternative extraction:', textError.message);
        if (response.candidates && response.candidates[0] && response.candidates[0].content) {
          aiResponse = response.candidates[0].content.parts[0].text;
        } else {
          console.error('Unexpected response format:', JSON.stringify(response, null, 2));
          throw new Error('Unable to extract text from Gemini AI response');
        }
      }
      
      if (!aiResponse || aiResponse.trim().length === 0) {
        throw new Error('Empty response from Gemini AI');
      }
      
      console.log('Successfully received response from Gemini AI, length:', aiResponse.length);
      
      // Parse actionable items from the response using the helper function
      const { cleanResponse, actionableItems } = parseActionableItems(aiResponse);
      
      // Return the response with actionable items if present
      res.json({ 
        response: cleanResponse, 
        tips: [], // Tips can be extracted from AI response if needed, but keeping empty for now
        actionableItems: actionableItems // Include parsed actionable items
      });
      return;
    } catch (apiError) {
      console.error('Gemini API error:', apiError);
      console.error('API Error details:', {
        message: apiError.message,
        status: apiError.status,
        statusText: apiError.statusText,
        response: apiError.response?.data
      });
      
      // Check for 404 - model not found error
      if (apiError.message && (apiError.message.includes('404') || apiError.message.includes('not found'))) {
        console.log('Model not found. Attempting to check available models and use REST API directly...');
        
        // Try using REST API directly instead of SDK
        try {
          // Use built-in fetch (Node.js 18+) 
          const globalFetch = typeof fetch !== 'undefined' ? fetch : require('node-fetch');
          
          // First, try to list available models
          console.log('Fetching available models...');
          const listUrl = `https://generativelanguage.googleapis.com/v1/models?key=${apiKey}`;
          const listResponse = await globalFetch(listUrl);
          
          if (!listResponse.ok) {
            // Try v1beta if v1 fails
            console.log('v1 failed, trying v1beta...');
            const listUrlBeta = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
            const listResponseBeta = await globalFetch(listUrlBeta);
            if (listResponseBeta.ok) {
              const listData = await listResponseBeta.json();
              await tryAvailableModels(listData, prompt, apiKey, res);
              return;
            }
            console.log(`Could not list models: ${listResponse.status} ${listResponse.statusText}`);
            // Fall through to try direct REST API
          } else {
            const listData = await listResponse.json();
            await tryAvailableModels(listData, prompt, apiKey, res);
            return;
          }
          
        } catch (listError) {
          console.error('Could not list models:', listError.message);
          console.error('List error details:', listError);
        }
        
        // Fallback: Try using REST API directly with common model names
        console.log('Trying direct REST API calls with common model names...');
        try {
          await tryDirectRestApi(prompt, apiKey, res);
          return;
        } catch (directError) {
          throw new Error(`Model "${modelName}" not found. Tried to auto-detect available models but failed. Please check your API key and available models in Google AI Studio. Error: ${apiError.message}`);
        }
      }
      
      // Check for specific API errors
      if (apiError.message && apiError.message.includes('API_KEY')) {
        throw new Error('Invalid or missing Gemini API key. Please check your API key configuration.');
      }
      if (apiError.message && apiError.message.includes('quota')) {
        throw new Error('Gemini API quota exceeded. Please check your API usage limits.');
      }
      if (apiError.message && apiError.message.includes('safety')) {
        throw new Error('Content was blocked by Gemini safety filters. Please rephrase your question.');
      }
      
      throw apiError;
    }

  } catch (error) {
    console.error('Error in assistant controller:', error);
    console.error('Error stack:', error.stack);
    
    // Provide more detailed error information
    let errorMessage = 'Failed to get AI response';
    if (error.message) {
      errorMessage += ': ' + error.message;
    }
    
    res.status(500).json({ 
      error: errorMessage,
      message: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

// Save AI-generated items to database
const saveAIGeneratedItems = async (req, res) => {
  const { items } = req.body; // items: { tasks: [], habits: [], goals: [] }
  const userId = req.user.id;
  
  if (!items || (Object.keys(items).length === 0)) {
    return res.status(400).json({ error: 'No items provided' });
  }
  
  const results = {
    tasks: [],
    habits: [],
    goals: [],
    errors: []
  };
  
  try {
    // Save tasks
    if (items.tasks && Array.isArray(items.tasks)) {
      for (const task of items.tasks) {
        await new Promise((resolve, reject) => {
          const subtasksJson = JSON.stringify(task.subtasks || []);
          db.run(
            'INSERT INTO tasks (user_id, title, deadline, category, subtasks, isDone) VALUES (?, ?, ?, ?, ?, 0)',
            [userId, task.title, task.deadline || null, task.category || null, subtasksJson],
            function (err) {
              if (err) {
                results.errors.push(`Task "${task.title}": ${err.message}`);
                reject(err);
              } else {
                // Add points for task creation
                db.run('UPDATE user_points SET points = points + 10 WHERE user_id = ?', [userId]);
                results.tasks.push({
                  id: this.lastID,
                  title: task.title,
                  deadline: task.deadline,
                  category: task.category
                });
                resolve();
              }
            }
          );
        }).catch(() => {}); // Continue even if one task fails
      }
    }
    
    // Save habits
    if (items.habits && Array.isArray(items.habits)) {
      for (const habit of items.habits) {
        await new Promise((resolve, reject) => {
          const completionHistory = JSON.stringify([]);
          db.run(
            'INSERT INTO habits (user_id, name, frequency, streak, completionHistory) VALUES (?, ?, ?, 0, ?)',
            [userId, habit.name, habit.frequency || 'daily', completionHistory],
            function (err) {
              if (err) {
                results.errors.push(`Habit "${habit.name}": ${err.message}`);
                reject(err);
              } else {
                // Add points for habit creation
                db.run('UPDATE user_points SET points = points + 10 WHERE user_id = ?', [userId]);
                results.habits.push({
                  id: this.lastID,
                  name: habit.name,
                  frequency: habit.frequency || 'daily'
                });
                resolve();
              }
            }
          );
        }).catch(() => {}); // Continue even if one habit fails
      }
    }
    
    // Save goals
    if (items.goals && Array.isArray(items.goals)) {
      for (const goal of items.goals) {
        await new Promise((resolve, reject) => {
          db.run(
            'INSERT INTO goals (user_id, title, target, deadline, progress) VALUES (?, ?, ?, ?, ?)',
            [userId, goal.title, goal.target || null, goal.deadline || null, 0],
            function (err) {
              if (err) {
                results.errors.push(`Goal "${goal.title}": ${err.message}`);
                reject(err);
              } else {
                // Add points for goal creation
                db.run('UPDATE user_points SET points = points + 15 WHERE user_id = ?', [userId]);
                results.goals.push({
                  id: this.lastID,
                  title: goal.title,
                  target: goal.target,
                  deadline: goal.deadline
                });
                resolve();
              }
            }
          );
        }).catch(() => {}); // Continue even if one goal fails
      }
    }
    
    const totalCreated = results.tasks.length + results.habits.length + results.goals.length;
    
    res.json({
      success: true,
      message: `Successfully created ${totalCreated} item(s)`,
      results: results
    });
    
  } catch (error) {
    console.error('Error saving AI-generated items:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to save some items',
      results: results,
      message: error.message
    });
  }
};

module.exports = { getAssistantResponse, saveAIGeneratedItems };
