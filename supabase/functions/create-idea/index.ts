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
    const { title, description, user_id } = await req.json()
    if (!title || !description || !user_id) {
      console.error('Missing required fields');
      return new Response('Missing required fields', { status: 400, headers: corsHeaders });
    }
    const openaiKey = Deno.env.get('OPENAI_API_KEY');

    if (!openaiKey) {
      console.error('OpenAI API key not configured');
      return new Response('OpenAI API key not configured', { status: 500, headers: corsHeaders });
    }

    const openai = new OpenAI({ apiKey: openaiKey });


    // Make OpenAI chat completion request
    const completion = await openai.chat.completions.create({
      messages: [
        {
          role: "system",
          content: `You are an expert product manager powering ideamax, an app that uses ai to generate simple and achieveable product requirements documents with extreme brevity.
          
          Assume the user has very little technical knowledge, unless their app summary would lead you to believe otherwise, and keep the output simple and actionable.
          
          Take the user's prompt and generate a very concise, digestible, achievable, and actionable plan with the following format:
          # Idea
          [3-4 bullet points describing the idea. Limit each bullet point to 7 words maximum]

          # Design
          [3-4 bullet points describing the user flow of the product, what it solves, and the UI design style. Limit each bullet point to 7 words maximum.]

          # Target Audience
          [3-4 bullet points describing the target audience. Limit each bullet point to 7 words maximum.]

          # MVP Features
          [2-4 numbered list items describing the core features of the product for an mvp. Limit each item to 7 words maximum.]
          `
        },
        {
          role: "user",
          content: `App Name: ${title}
          Description: ${description}`
        }
      ],
      model: "gpt-4",
    })

    const generatedIdea = completion.choices[0].message.content

    if (!generatedIdea) {
      console.error('No generated idea');
      return new Response('No generated idea', { status: 500, headers: corsHeaders });
    }

    // Insert the idea into the database
    const { data, error } = await supabase
      .from('ideas')
      .insert([
        {
          plan: generatedIdea,
          title: title,
          description: description,
          user_id: user_id,
        }
      ])
      .select()
      .single()

    if (error) {
      console.error('Error inserting idea', error);
      return new Response('Error inserting idea', { status: 500, headers: corsHeaders });
    }

    return new Response(
      JSON.stringify({ success: true, data }),
      { headers: { ...corsHeaders, "Content-Type": "application/json", status: 200 } }
    )

  } 
  catch (error) {
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { headers: { ...corsHeaders,"Content-Type": "application/json" }, status: 400 }
    )
  }
})

/* To invoke locally:

  1. Run `supabase start` (see: https://supabase.com/docs/reference/cli/supabase-start)
  2. Make an HTTP request:

  curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/create-idea' \
    --header 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0' \
    --header 'Content-Type: application/json' \
    --data '{"name":"Functions"}'

*/
