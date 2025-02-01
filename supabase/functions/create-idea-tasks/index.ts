// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import OpenAI from "https://deno.land/x/openai@v4.24.0/mod.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0"
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Initialize Supabase client
const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const supabase = createClient(supabaseUrl, supabaseServiceKey)

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { idea_id, user_id } = await req.json()
    
    if (!idea_id || !user_id) {
      return new Response('Missing required fields', { status: 400, headers: corsHeaders });
    }

    // Fetch the idea details
    const { data: idea, error: ideaError } = await supabase
      .from('ideas')
      .select('*')
      .eq('id', idea_id)
      .single()

    if (ideaError || !idea) {
      return new Response('Error fetching idea', { status: 404, headers: corsHeaders });
    }

    const openaiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openaiKey) {
      return new Response('OpenAI API key not configured', { status: 500, headers: corsHeaders });
    }

    const openai = new OpenAI({ apiKey: openaiKey });

    // Make OpenAI chat completion request
    const completion = await openai.chat.completions.create({
      messages: [
        {
          role: "system",
          content: `You are a technical project manager breaking down product development into clear tasks and subtasks.
          Given an app idea summary, generate 3 main tasks for that guide the user to complete an MVP for their idea in a reasonable amount of time.
          
          For each task, create 3-7 **actionable** and simple subtasks. 
          Assume the user has very little technical knowledge, unless their app summary would lead you to believe otherwise.
          
          For the design task, create subtasks based on the pages or components the app will have.
          For the develop task, create subtasks based on the features the app will have.
          For the market task, create subtasks based on the target audience and how to reach them.
          
          Format your response as a JSON object with this exact structure:
          {
            "tasks": [
              {
                "title": "Design",
                "description": "[Brief task description (max 15 words)]",
                "subtasks": [
                  {
                    "title": "[Subtask title (max 7 words)]",
                    "description": "[Brief subtask description (max 15 words)]",
                    "prompt": "[Prompt that will help the user complete the subtask]"
                  }
                ]
              },
              {
                "title": "Develop",
                "description": "[Brief task description (max 15 words)]",
                "subtasks": [
                  {
                    "title": "[Subtask title (max 7 words)]",
                    "description": "[Brief subtask description (max 15 words)]",
                    "prompt": "[Prompt that will help the user complete the subtask]"
                  }
                ]
              },
              {
                "title": "Market",
                "description": "[Brief task description (max 15 words)]",
                "subtasks": [
                  {
                    "title": "[Subtask title (max 7 words)]",
                    "description": "[Brief subtask description (max 15 words)]",
                    "prompt": "[Prompt that will help the user complete the subtask]"
                  }
                ]
              }
            ]
          }`
        },
        {
          role: "user",
          content: `App Name: ${idea.title}
          Description: ${idea.description}
          Generated Plan: ${idea.plan}`
        }
      ],
      model: "gpt-3.5-turbo",
      response_format: { type: "json_object" }
    })

    const tasksData = JSON.parse(completion.choices[0].message.content);
    console.log(tasksData);

    // Insert tasks and get their IDs
    for (const task of tasksData.tasks) {
      // Insert main task
      const { data: taskData, error: taskError } = await supabase
        .from('tasks')
        .insert({
          title: task.title,
          description: task.description,
          idea_id: idea_id,
        })
        .select()
        .single()

      if (taskError) {
        console.error('Error inserting task:', taskError);
        continue;
      }

      // Insert subtasks
      const subtasksToInsert = task.subtasks.map(subtask => ({
        title: subtask.title,
        description: subtask.description,
        // prompt: subtask.prompt,
        task_id: taskData.id,
      }));

      const { error: subtaskError } = await supabase
        .from('subtasks')
        .insert(subtasksToInsert)

      if (subtaskError) {
        console.error('Error inserting subtasks:', subtaskError);
      }
    }

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )

  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
    )
  }
})

/* To invoke locally:

  1. Run `supabase start` (see: https://supabase.com/docs/reference/cli/supabase-start)
  2. Make an HTTP request:

  curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/create-idea-tasks' \
    --header 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0' \
    --header 'Content-Type: application/json' \
    --data '{"name":"Functions"}'

*/
