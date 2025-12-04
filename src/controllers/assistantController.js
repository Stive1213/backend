const { db } = require('../config/db');
// Using REST API directly - no SDK needed (avoids deprecated model issues)

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
        // Handle error response - might be JSON or plain text
        let errorText = '';
        const contentType = response.headers.get('content-type');
        try {
          if (contentType && contentType.includes('application/json')) {
            const errorData = await response.json();
            errorText = errorData.error?.message || errorData.message || JSON.stringify(errorData);
          } else {
            errorText = await response.text();
          }
        } catch (parseError) {
          errorText = `HTTP ${response.status}: ${response.statusText}`;
        }
        console.log(`API version ${version} returned ${response.status}:`, errorText);
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

// Helper function to try available models (free tier only)
async function tryAvailableModels(listData, prompt, apiKey, res) {
  // Free tier model names - only these are allowed
  const freeTierModelNames = ['gemini-1.5-flash', 'gemini-1.0-pro', 'gemini-2.5-flash', 'gemini-2.5-flash-lite'];
  
  if (listData.models && listData.models.length > 0) {
    const availableModels = listData.models
      .filter(m => {
        const modelName = m.name.replace('models/', '');
        // Only allow free tier models
        return freeTierModelNames.includes(modelName) && 
               m.supportedGenerationMethods && 
               m.supportedGenerationMethods.includes('generateContent');
      })
      .map(m => m.name.replace('models/', ''))
      .sort((a, b) => {
        // Prioritize flash models first (they're faster and more available)
        const aIsFlash = a.includes('flash');
        const bIsFlash = b.includes('flash');
        if (aIsFlash && !bIsFlash) return -1;
        if (!aIsFlash && bIsFlash) return 1;
        return 0;
      });
    
    console.log('Available FREE tier models that support generateContent:', availableModels);
    
    if (availableModels.length === 0) {
      throw new Error('No free tier models found that support generateContent');
    }
    
    // Try each available free tier model using REST API
    for (const workingModelName of availableModels) {
      try {
        console.log(`Trying FREE tier model via REST API: ${workingModelName}`);
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
        console.log(`Free tier model ${workingModelName} failed:`, modelError.message);
        continue;
      }
    }
  }
  throw new Error('No working free tier models found');
}

// Helper function to try direct REST API with common models (free tier only)
async function tryDirectRestApi(prompt, apiKey, res) {
  const commonModels = ['gemini-1.5-flash', 'gemini-1.0-pro'];
  
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
            db.all("SELECT SUM(amount) as total FROM transactions WHERE user_id = ? AND type = 'expense' AND date LIKE ?", 
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

    // Get API key
    const apiKey = process.env.GEMINI_API_KEY || 'AIzaSyBPrFD1oX9Dpu3DwPrWYeuFk6xh6HcgNGs';
    
    if (!apiKey) {
      throw new Error('Gemini API key is not configured');
    }

    console.log('Sending request to Gemini AI using REST API (FREE TIER MODELS ONLY)...');
    console.log('API Key present:', !!apiKey);
    console.log('Prompt length:', prompt.length);
    
    // Use REST API directly - skip SDK to avoid deprecated model issues
    // Only use FREE tier models
    const freeTierModels = [
      'gemini-1.5-flash',     // Fast, free tier model - PRIMARY
      'gemini-1.0-pro',       // Free tier model - FALLBACK
    ];
    
    let lastError = null;
    
    // Try using REST API directly with free tier models first
    console.log('Trying REST API with FREE tier models only...');
    try {
      await tryDirectRestApi(prompt, apiKey, res);
      return; // Success!
    } catch (directError) {
      console.log('Direct REST API with free models failed, trying to list available models...');
      lastError = directError;
    }
    
    // Try to list available models and filter for free tier only
    try {
      const globalFetch = typeof fetch !== 'undefined' ? fetch : require('node-fetch');
      
      // Try v1 first
      console.log('Fetching available FREE tier models...');
      const listUrl = `https://generativelanguage.googleapis.com/v1/models?key=${apiKey}`;
      const listResponse = await globalFetch(listUrl);
      
      if (!listResponse.ok) {
        // Try v1beta if v1 fails
        console.log('v1 failed, trying v1beta...');
        const listUrlBeta = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
        const listResponseBeta = await globalFetch(listUrlBeta);
        if (listResponseBeta.ok) {
          try {
            const listData = await listResponseBeta.json();
            await tryAvailableModels(listData, prompt, apiKey, res);
            return;
          } catch (jsonError) {
            console.error('Failed to parse model list JSON:', jsonError.message);
          }
        }
        const errorText = await listResponseBeta.text().catch(() => listResponseBeta.statusText);
        console.log(`Could not list models: ${listResponseBeta.status} ${errorText}`);
      } else {
        try {
          const listData = await listResponse.json();
          await tryAvailableModels(listData, prompt, apiKey, res);
          return;
        } catch (jsonError) {
          console.error('Failed to parse model list JSON:', jsonError.message);
        }
      }
    } catch (listError) {
      console.error('Could not list models:', listError.message);
    }
    
    // Final error - tried everything
    throw new Error(`Failed to get AI response using FREE tier models only. Tried: ${freeTierModels.join(', ')}. Please check your API key and ensure you have access to free tier models in Google AI Studio. Last error: ${lastError?.message || 'Unknown error'}`);

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
