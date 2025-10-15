import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    )

    // Get user from auth
    const {
      data: { user },
      error: userError,
    } = await supabaseClient.auth.getUser()

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      )
    }

    const { orderId } = await req.json()

    if (!orderId) {
      return new Response(
        JSON.stringify({ error: 'Order ID is required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    console.log(`User ${user.id} attempting to accept order ${orderId}`)

    // Atomic update: Only assign if currently unassigned and ready for pickup
    const { data: order, error: updateError } = await supabaseClient
      .from('orders')
      .update({
        delivery_person_id: user.id,
        status: 'picked_up',
        updated_at: new Date().toISOString()
      })
      .eq('id', orderId)
      .eq('status', 'ready_for_pickup')
      .is('delivery_person_id', null)
      .select(`
        *,
        stores(name, address),
        profiles!customer_id(full_name, phone)
      `)
      .single()

    if (updateError) {
      console.error('Update error:', updateError)

      // Check if order was already assigned
      const { data: existingOrder } = await supabaseClient
        .from('orders')
        .select(`
          *,
          profiles!delivery_person_id(full_name)
        `)
        .eq('id', orderId)
        .single()

      if (existingOrder && existingOrder.delivery_person_id) {
        return new Response(
          JSON.stringify({
            error: 'OrderAlreadyAssigned',
            message: 'This order has already been accepted by another delivery person',
            assignedTo: {
              id: existingOrder.delivery_person_id,
              name: existingOrder.profiles?.full_name || 'Unknown'
            },
            assignedAt: existingOrder.updated_at
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 409 }
        )
      }

      return new Response(
        JSON.stringify({ error: 'Failed to accept order', details: updateError.message }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    if (!order) {
      return new Response(
        JSON.stringify({ error: 'Order not found or not available' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
      )
    }

    console.log(`Order ${orderId} successfully accepted by user ${user.id}`)

    // Return success response
    return new Response(
      JSON.stringify({
        success: true,
        orderId: order.id,
        status: order.status,
        assignedTo: {
          id: user.id,
          name: user.email
        },
        assignedAt: order.updated_at,
        order: order
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )
  } catch (error: unknown) {
    console.error('Unexpected error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: errorMessage }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})