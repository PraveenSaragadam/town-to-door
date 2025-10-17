import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.75.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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
    );

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { orderId } = await req.json();
    console.log('Accept order request:', { orderId, userId: user.id });

    // Atomic order acceptance - update only if conditions match
    const { data: updatedOrder, error: updateError } = await supabaseClient
      .from('orders')
      .update({
        delivery_person_id: user.id,
        status: 'assigned',
      })
      .eq('id', orderId)
      .eq('status', 'ready_for_pickup')
      .is('delivery_person_id', null)
      .select('*, profiles!delivery_person_id(full_name)')
      .single();

    if (updateError || !updatedOrder) {
      console.error('Failed to assign order:', updateError);
      
      // Check if order was already assigned
      const { data: assignedOrder } = await supabaseClient
        .from('orders')
        .select('*, profiles!delivery_person_id(full_name)')
        .eq('id', orderId)
        .single();

      if (assignedOrder?.delivery_person_id && assignedOrder.delivery_person_id !== user.id) {
        return new Response(
          JSON.stringify({
            error: 'OrderAlreadyAssigned',
            assignedTo: {
              id: assignedOrder.delivery_person_id,
              name: assignedOrder.profiles?.full_name || 'Unknown',
            },
            assignedAt: assignedOrder.updated_at,
          }),
          {
            status: 409,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      return new Response(
        JSON.stringify({ error: 'Order not found or not available' }),
        {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    console.log('Order assigned successfully:', { orderId, userId: user.id });

    return new Response(
      JSON.stringify({
        orderId: updatedOrder.id,
        status: updatedOrder.status,
        assignedTo: {
          id: user.id,
          name: updatedOrder.profiles?.full_name || 'You',
        },
        assignedAt: updatedOrder.updated_at,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error in accept-order function:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
