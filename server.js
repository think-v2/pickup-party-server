const http = require("http");
const WebSocket = require("ws");

const server = http.createServer();
const wss = new WebSocket.Server({ server });

const lobbies = {};

const PHASE = {
  WAITING: 0,
  PROMPT: 1,
  RESPONSE: 2,
  VOTING: 3,
  SCORE: 4,
}

const PROMPTPROMPTS = [
  "Dating me is like ",
  "This year I really want to ",
  "I want someone who ",
  "My love language is ",
  "Typical Sunday ",
  "The secret to getting to know me is ",
  "The dorkiest thing about me is ",
  "First round is on me if ",
  "Together, we could ",
  "A life goal of mine ",
  "A random fact I love is ",
  "A shower thought I recently had ",
  "All I ask is ",
  "Change my mind about ",
  "Apparently, my life’s soundtrack is ",
  "Biggest risk I’ve taken ",
  "I recently discovered that ",
  "Don’t hate me if I ",
  "My simple pleasures ",
  "Guess my secret talent ",
  "I geek out on ",
  "Green flags I look for ",
  "I know the best spot in town for ",
  "I wish more people knew ",
  "I won’t shut up about ",
  "I’m weirdly attracted to ",
  "Most spontaneous thing I’ve done ",
  "Unusual skills ",
  "My most irrational fear ",
  "My best dad joke ",
  "The kindest thing someone has ever done for me ",
  "The award my family would give me ",
  "Something my pet thinks about me ",
  "You’d never know it, but I ",
  "If I could have dinner with anyone, dead or alive ",
  "The most controversial opinion I have ",
  "My biggest relationship dealbreaker is ",
  "On a lazy day, you’ll find me ",
  "My proudest recent moment ",
  "The thing I’m most grateful for is ",
  "The last book/movie that stayed with me ",
  "What I’m looking forward to ",
  "I get along best with people who ",
  "My ideal weekend includes ",
  "A habit I’m trying to break ",
  "One thing I’ll never apologize for ",
  "If I were a superhero, my power would be ",
  "One thing I always do before bed "
];

function progressPhase(ws) {
  lobbies[ws.lobbyId].phase = (lobbies[ws.lobbyId].phase+1)%5;
  //console.log('new phase',lobbies[ws.lobbyId].phase);
  if (lobbies[ws.lobbyId].phase === PHASE.WAITING) {
    distributeWaitingRoom(ws);
  }
  else if (lobbies[ws.lobbyId].phase === PHASE.PROMPT) {
    distributePromptPrompts(ws);
  } else if (lobbies[ws.lobbyId].phase === PHASE.RESPONSE) {
    distributePrompts(ws);
  } else if (lobbies[ws.lobbyId].phase === PHASE.VOTING) {
    //console.log(lobbies[ws.lobbyId].prompts);
    lobbies[ws.lobbyId].votingOrder = Object.keys(lobbies[ws.lobbyId].prompts);
    distributeResponses(ws);
  } else if (lobbies[ws.lobbyId].phase === PHASE.SCORE) {
    applyVotesToScores(ws);
    distributeScores(ws);
  }
}

function progressVotingPhase(ws) {
  lobbies[ws.lobbyId].votingIndex++;
  distributeResponses(ws);
  applyVotesToScores(ws);
  //console.log(lobbies[ws.lobbyId].scores);
}

function applyVotesToScores(ws) {
  Object.keys(lobbies[ws.lobbyId].votes).forEach((voterId) => {
    if (lobbies[ws.lobbyId].scores[lobbies[ws.lobbyId].votes[voterId]]) {
      lobbies[ws.lobbyId].scores[lobbies[ws.lobbyId].votes[voterId]] += 1;
    } else {
      lobbies[ws.lobbyId].scores[lobbies[ws.lobbyId].votes[voterId]] = 1;
    }
    // give a point to everyone who votes to encourage voting
    if (lobbies[ws.lobbyId].scores[voterId]) {
      lobbies[ws.lobbyId].scores[voterId] += 1;
    } else {
      lobbies[ws.lobbyId].scores[voterId] = 1;
    }
    
    delete lobbies[ws.lobbyId].votes[voterId];
  });
}

function distributeWaitingRoom(ws) {
  lobbies[ws.lobbyId].promptprompts = {};
  lobbies[ws.lobbyId].prompts = {};
  lobbies[ws.lobbyId].votes = {};
  lobbies[ws.lobbyId].scores = {};
  lobbies[ws.lobbyId].phase = PHASE.WAITING;
  lobbies[ws.lobbyId].promptprompts = {};
  lobbies[ws.lobbyId].votingOrder = [];
  lobbies[ws.lobbyId].votingIndex = 0;

  lobbies[ws.lobbyId].clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      data = {
        type: "waiting room",
      };
      client.send(JSON.stringify(data));
    }
  });
}

function distributeScores(ws) {
  const scoreboard = {};
  Object.keys(lobbies[ws.lobbyId].ids).forEach((id) => {
    scoreboard[lobbies[ws.lobbyId].ids[id].name] = 0; // incase someone scores no points
  });
  Object.keys(lobbies[ws.lobbyId].scores).forEach((id) => {
    scoreboard[lobbies[ws.lobbyId].ids[id].name] = lobbies[ws.lobbyId].scores[id];
  });

  

  lobbies[ws.lobbyId].clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      data = {
        type: "scores",
        content: scoreboard,
      };
      client.send(JSON.stringify(data));
    }
  });
}

function distributePromptPrompts(ws) {
  const currentPromptPromptsSet = new Set();
  while (currentPromptPromptsSet.size < lobbies[ws.lobbyId].clients.size) {
    const promptprompt = PROMPTPROMPTS[Math.floor(Math.random() * PROMPTPROMPTS.length)]
    currentPromptPromptsSet.add(promptprompt)
  }
  const currentPromptPrompts = [...currentPromptPromptsSet];
  //console.log(currentPromptPrompts);
  lobbies[ws.lobbyId].clients.forEach((client) => {
    lobbies[ws.lobbyId].promptprompts[client.id] = currentPromptPrompts.pop();
    if (client.readyState === WebSocket.OPEN) {
      data = {
        type: "promptprompt",
        content: lobbies[ws.lobbyId].promptprompts[client.id],
      };
      client.send(JSON.stringify(data));
    }
  });
}

function distributePrompts(ws) {
  lobbies[ws.lobbyId].clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      data = {
        type: "prompts",
        content: lobbies[ws.lobbyId].prompts,
      };
      client.send(JSON.stringify(data));
    }
  });
}

function distributeResponses(ws) {
  if (! lobbies[ws.lobbyId].prompts[lobbies[ws.lobbyId].votingIndex]) {
    progressPhase(ws);
    return;
  }
  
  lobbies[ws.lobbyId].clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      data = {
        type: "responses",
        content: lobbies[ws.lobbyId].prompts[lobbies[ws.lobbyId].votingIndex],
      };
      client.send(JSON.stringify(data));
    }
  });
}

function leaveLobby(ws) {
  if (ws.lobbyId && lobbies[ws.lobbyId].clients.size == 1) {
    delete lobbies[ws.lobbyId];
  }
  else if (ws.lobbyId) {
    if (lobbies[ws.lobbyId].admin === ws) {
      for (const client of lobbies[ws.lobbyId].clients) {
        if (client != ws) {
          lobbies[ws.lobbyId].admin = client;
          break;
        }
      }
    }

    delete lobbies[ws.lobbyId].ids[ws.id];
    lobbies[ws.lobbyId].clients.delete(ws);
    sendPlayerList(ws);
  }
}

function sendPlayerList(ws) {
  //const playerList = Array.from(lobbies[ws.lobbyId].clients, ws => ws.name);
  const playerList = Object.fromEntries(
    Object.entries(lobbies[ws.lobbyId].ids).map(([key, value]) => [key, value.name])
  );
  lobbies[ws.lobbyId].clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      data = {
        type: "player list",
        content: playerList,
        admin: lobbies[ws.lobbyId].admin.id,
      };
      client.send(JSON.stringify(data));
    }
  });
}

function join(ws, data) {
  leaveLobby(ws)

  // create lobby if needed
  if (!(data.content in lobbies)) {
    lobbies[data.content] = {
      clients: new Set([]),
      ids: {},
      admin: ws,
      nextId: 0,
      promptprompts: {},
      prompts: {},
      votes: {},
      scores: {},
      phase: PHASE.WAITING,
      votingOrder: [],
      votingIndex: 0,
    };
  } else {
    if (lobbies[data.content].phase != PHASE.WAITING) {
      return;
    }
  }

  ws.lobbyId = data.content;
  ws.name = data.name;

  lobbies[data.content].clients.add(ws);
  ws.id = lobbies[data.content].nextId++;
  lobbies[data.content].ids[ws.id] = ws;

  if (ws.readyState === WebSocket.OPEN) {
    data = {
      type: "give id",
      content: ws.id,
    };
    ws.send(JSON.stringify(data));
  }

  sendPlayerList(ws);
}

function submitPrompt(ws, data) {
  if (!lobbies[ws.lobbyId].prompts[ws.id]) {
    lobbies[ws.lobbyId].prompts[ws.id] = {};
  }
  lobbies[ws.lobbyId].prompts[ws.id].content = lobbies[ws.lobbyId].promptprompts[ws.id] + data.content;
  if (!lobbies[ws.lobbyId].prompts[ws.id].responses) {
    lobbies[ws.lobbyId].prompts[ws.id].responses = {};
  }
}

function submitResponse(ws, data) {
  if (data.prompterId == ws.id || ! (data.prompterId in lobbies[ws.lobbyId].ids)) {
    return;
  }
  lobbies[ws.lobbyId].prompts[data.prompterId].responses[ws.id] = data.content;
}

function submitVote(ws, data) {
  if (data.content == ws.id || ! (data.content in lobbies[ws.lobbyId].ids)) {
    return;
  }
  lobbies[ws.lobbyId].votes[ws.id] = data.content;
  //console.log(lobbies[ws.lobbyId].votes);
  const currentVotes = {};
  Object.values(lobbies[ws.lobbyId].votes).forEach((voterId) => {
    if (currentVotes[voterId]) {
      currentVotes[voterId] += 1;
    } else {
      currentVotes[voterId] = 1;
    }
  });
  lobbies[ws.lobbyId].clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      data = {
        type: "votes",
        content: currentVotes,
      };
      client.send(JSON.stringify(data));
    }
  });
}

function submitMessage(ws,data) {
  lobbies[ws.lobbyId].clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      data = {
        type: "message",
        from: ws.name,
        content: data.content,
      };
      client.send(JSON.stringify(data));
    }
  });
}

wss.on('connection', (ws) => {
  //console.log('New client connected');

  ws.on('message', (message) => {
    message = message.toString();
    //console.log(`Received: ${message}`);
    try {
      const data = JSON.parse(message);
      //console.log(data);

      if (data.type === "join" && data.content && data.name) {
        join(ws, data);
      } else if (data.type === "submit message" && data.content && ws.lobbyId) {
        submitMessage(ws,data);
      } else if (data.type === "submit prompt" && data.content && ws.lobbyId) {
        submitPrompt(ws, data);
      } else if (data.type === "submit response" && data.content && ws.lobbyId) {
        submitResponse(ws, data);
      } else if (data.type === "submit vote" && data.content && ws.lobbyId) {
        submitVote(ws, data);
      } else if (data.type === "progress phase" && ws.lobbyId) {
        if (ws === lobbies[ws.lobbyId].admin) {
          progressPhase(ws);
        }
      } else if (data.type === "progress voting phase" && ws.lobbyId) {
        progressVotingPhase(ws);
      }
    } catch (err) {
      console.error(err,message);
    }
  });

  ws.on('close', () => {
    //console.log('Client disconnected');
    leaveLobby(ws);
  });
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => console.log(`Listening on ${PORT}`));