import { workflow, node, trigger, languageModel, outputParser, newCredential, expr, sticky } from '@n8n/workflow-sdk';

const startHook = trigger({
  type: 'n8n-nodes-base.webhook',
  version: 2.2,
  config: {
    name: 'Start or Resume Call',
    parameters: { httpMethod: 'POST', path: 'samjho-start', responseMode: 'responseNode', options: {} }
  },
  output: [{ body: { user_key: 'demo' } }]
});

const normalizeStart = node({
  type: 'n8n-nodes-base.set',
  version: 3.4,
  config: {
    name: 'Normalize Start',
    parameters: {
      mode: 'manual',
      includeOtherFields: false,
      assignments: {
        assignments: [
          { id: 'uk', name: 'user_key', value: expr('{{ ($json.body?.user_key ?? $json.query?.u ?? "demo").toString().trim() || "demo" }}'), type: 'string' }
        ]
      }
    }
  },
  output: [{ user_key: 'demo' }]
});

const rpcStart = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: 'DB Start or Resume',
    parameters: {
      method: 'POST',
      url: 'https://fbwfxbubrxpbfzwmbhrk.supabase.co/rest/v1/rpc/start_or_resume',
      authentication: 'predefinedCredentialType',
      nodeCredentialType: 'supabaseApi',
      sendBody: true,
      contentType: 'json',
      specifyBody: 'json',
      jsonBody: expr('{{ JSON.stringify({ p_user_key: $json.user_key }) }}'),
      options: { timeout: 8000 }
    },
    credentials: { supabaseApi: newCredential('Supabase Samjho') }
  },
  output: [{ say: 'Namaste! ...', status: 'active', progress: '0/8' }]
});

const respondStart = node({
  type: 'n8n-nodes-base.respondToWebhook',
  version: 1.5,
  config: {
    name: 'Reply Start',
    parameters: { respondWith: 'firstIncomingItem', options: {} }
  }
});

const answerHook = trigger({
  type: 'n8n-nodes-base.webhook',
  version: 2.2,
  config: {
    name: 'Answer Received',
    parameters: { httpMethod: 'POST', path: 'samjho-answer', responseMode: 'responseNode', options: {} }
  },
  output: [{ body: { user_key: 'demo', answer: 'Meri kirana dukaan hai, roz shaam hisaab milata hoon' } }]
});

const normalizeAnswer = node({
  type: 'n8n-nodes-base.set',
  version: 3.4,
  config: {
    name: 'Normalize Answer',
    parameters: {
      mode: 'manual',
      includeOtherFields: false,
      assignments: {
        assignments: [
          { id: 'uk', name: 'user_key', value: expr('{{ ($json.body?.user_key ?? $json.query?.u ?? "demo").toString().trim() || "demo" }}'), type: 'string' },
          { id: 'ans', name: 'answer', value: expr('{{ ($json.body?.answer ?? $json.body?.text ?? $json.query?.answer ?? "").toString().trim() }}'), type: 'string' }
        ]
      }
    }
  },
  output: [{ user_key: 'demo', answer: 'Meri kirana dukaan hai, roz shaam hisaab milata hoon' }]
});

const rpcContext = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: 'DB Where Are We',
    parameters: {
      method: 'POST',
      url: 'https://fbwfxbubrxpbfzwmbhrk.supabase.co/rest/v1/rpc/current_turn',
      authentication: 'predefinedCredentialType',
      nodeCredentialType: 'supabaseApi',
      sendBody: true,
      contentType: 'json',
      specifyBody: 'json',
      jsonBody: expr('{{ JSON.stringify({ p_user_key: $json.user_key }) }}'),
      options: { timeout: 8000 }
    },
    credentials: { supabaseApi: newCredential('Supabase Samjho') }
  },
  output: [{ status: 'active', question_key: 'problem', question_label: 'The problem and who does the task', question_ask: 'Aapke kaam mein...', followups_used: 0, answers_so_far: [], items_for_this_question: [] }]
});

const claude = languageModel({
  type: '@n8n/n8n-nodes-langchain.lmChatAnthropic',
  version: 1.6,
  config: {
    name: 'Claude Haiku',
    parameters: {
      model: { __rl: true, mode: 'id', value: 'claude-haiku-4-5' },
      options: { maxTokensToSample: 900, temperature: 0.2 }
    },
    credentials: { anthropicApi: newCredential('Anthropic') }
  }
});

const parser = outputParser({
  type: '@n8n/n8n-nodes-langchain.outputParserStructured',
  version: 1.3,
  config: {
    name: 'Turn Result Shape',
    parameters: {
      schemaType: 'manual',
      inputSchema: JSON.stringify({
        type: 'object',
        properties: {
          intent: { type: 'string', enum: ['answer', 'confirm', 'dont_know', 'skip', 'stop', 'question'] },
          items: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                kind: { type: 'string', enum: ['observation', 'claim', 'assumption'] },
                text: { type: 'string' },
                quote: { type: 'string' },
                sensitive: { type: 'boolean' }
              },
              required: ['kind', 'text', 'quote', 'sensitive']
            }
          },
          needs_followup: { type: 'boolean' },
          followup: { type: 'string' },
          ack: { type: 'string' },
          reply: { type: 'string' }
        },
        required: ['intent', 'items', 'needs_followup', 'followup', 'ack', 'reply']
      }, null, 2)
    }
  }
});

const analyse = node({
  type: '@n8n/n8n-nodes-langchain.chainLlm',
  version: 1.9,
  config: {
    name: 'Understand Answer',
    onError: 'continueErrorOutput',
    parameters: {
      promptType: 'define',
      hasOutputParser: true,
      text: expr(
        'QUESTION BEING ASKED: {{ $json.question_label }} | spoken as: {{ $json.question_ask }}\n' +
        'FOLLOW-UPS ALREADY USED ON THIS QUESTION: {{ $json.followups_used ?? 0 }} of 2\n' +
        'ALREADY CAPTURED FOR THIS QUESTION: {{ ($json.items_for_this_question || []).join(" | ") || "nothing yet" }}\n' +
        'EARLIER ANSWERS IN THIS INTERVIEW:\n{{ ($json.answers_so_far || []).map(a => "- [" + a.q + "] " + a.answer).join("\\n") || "- none" }}\n\n' +
        'NEW ANSWER FROM THE SHOP OWNER (speech transcript, copy quotes from this exactly):\n{{ $("Normalize Answer").item.json.answer }}'
      ),
      messages: {
        messageValues: [
          {
            type: 'SystemMessagePromptTemplate',
            message:
              'You are the analysis brain of Samjho, a Hinglish voice interviewer that helps a small Indian shop owner describe a daily problem so that a builder can understand it. Read the new answer and return the structured result.\n\n' +
              '1. intent. Exactly one of: answer (any real content), confirm (only haan, ok, theek hai, confirm, with no new content), dont_know (they do not know), skip (they do not want to answer), stop (they want to end, pause, or talk later), question (they ask you something instead of answering).\n\n' +
              '2. items. Break the answer into separate atomic statements in simple English. For each item:\n' +
              '- kind: observation = something they did or saw, with a concrete detail such as a time, number, step, person or specific instance. claim = a general statement presented as fact with no specific instance, for example customers always pay late. assumption = a guess, belief, cause or prediction, for example I think, shayad, lagta hai, AI se ho jayega, staff ki galti hogi.\n' +
              '- quote: copy 3 to 15 consecutive words EXACTLY as they appear in the answer. Same spelling, same script, no translation, no corrections. If you cannot copy exactly, use the whole answer.\n' +
              '- sensitive: true if the statement contains a person name, phone number, UPI ID, account number, address, or an amount tied to a named person.\n' +
              'Never add anything the person did not say. No advice. If intent is not answer, return an empty items list.\n\n' +
              '3. needs_followup and followup. needs_followup is true only when the answer misses what this question needs: a number for frequency, time or money questions; a specific real example for last time or impact questions; or who does the work. It is also true when the new answer contradicts an earlier answer; then the follow-up politely names both versions and asks which is correct. If follow-ups used is already 2, needs_followup must be false. The follow-up is ONE short Hinglish question, at most 18 words, about their real past experience, built on their own words, never leading, never a yes or no question, no suggestions.\n\n' +
              '4. ack. At most 14 words of natural Hinglish that reflects back one specific detail they just said, like a good human interviewer. No praise words such as great, wonderful, bahut badhiya. Empty if intent is stop.\n\n' +
              '5. reply. Only when intent is question: at most 2 short Hinglish sentences. If they ask for a solution, say that solutions come after the brief is ready. Otherwise empty.\n\n' +
              'Write ack, followup and reply in Roman-script Hinglish because a voice will read them aloud. Avoid symbols, emojis and abbreviations.'
          }
        ]
      }
    },
    subnodes: { model: claude, outputParser: parser }
  },
  output: [{ output: { intent: 'answer', items: [{ kind: 'observation', text: 'Owner reconciles Paytm and cash every evening', quote: 'roz shaam hisaab milata hoon', sensitive: false }], needs_followup: false, followup: '', ack: 'Achha, roz shaam hisaab aap milate hain.', reply: '' } }]
});

const aiFallback = node({
  type: 'n8n-nodes-base.set',
  version: 3.4,
  config: {
    name: 'AI Slow Fallback',
    parameters: {
      mode: 'raw',
      jsonOutput: '{ "output": { "intent": "answer", "items": [], "needs_followup": true, "followup": "Maaf kijiye, network thoda slow tha. Kya aap woh baat ek baar aur bata sakte hain?", "ack": "", "reply": "" } }'
    }
  },
  output: [{ output: { intent: 'answer', items: [], needs_followup: true, followup: 'Maaf kijiye...', ack: '', reply: '' } }]
});

const rpcRecord = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: 'DB Record Turn',
    parameters: {
      method: 'POST',
      url: 'https://fbwfxbubrxpbfzwmbhrk.supabase.co/rest/v1/rpc/record_turn',
      authentication: 'predefinedCredentialType',
      nodeCredentialType: 'supabaseApi',
      sendBody: true,
      contentType: 'json',
      specifyBody: 'json',
      jsonBody: expr('{{ JSON.stringify({ p_user_key: $("Normalize Answer").item.json.user_key, p_answer: $("Normalize Answer").item.json.answer, p_result: $json.output }) }}'),
      options: { timeout: 8000 }
    },
    credentials: { supabaseApi: newCredential('Supabase Samjho') }
  },
  output: [{ say: 'Achha. Pichli baar jab yeh hua tha...', status: 'active', progress: '1/8' }]
});

const respondAnswer = node({
  type: 'n8n-nodes-base.respondToWebhook',
  version: 1.5,
  config: {
    name: 'Reply Answer',
    parameters: { respondWith: 'firstIncomingItem', options: {} }
  }
});

const note = sticky(
  '## Samjho turn engine\nVoice agent is only the mouth. Each answer: fetch state from Supabase, Claude tags statements with exact quotes and suggests a follow-up, then the database decides what happens next (no skipping, max 2 follow-ups, duplicate guard). If Claude fails, the agent asks the person to repeat instead of losing the answer.',
  [answerHook, normalizeAnswer, rpcContext, analyse, rpcRecord, respondAnswer],
  { color: 4 }
);

export default workflow('samjho-turn', 'Samjho - Interview Turn')
  .add(startHook)
  .to(normalizeStart)
  .to(rpcStart)
  .to(respondStart)
  .add(answerHook)
  .to(normalizeAnswer)
  .to(rpcContext)
  .to(analyse.onError(aiFallback.to(rpcRecord)))
  .add(analyse)
  .to(rpcRecord)
  .to(respondAnswer)
  .add(note);
