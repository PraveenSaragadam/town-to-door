import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import Header from "@/components/layout/Header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { MapPin, Package, Star, CheckCircle, Truck, Sparkles } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface Order {
  id: string;
  status: string;
  total_amount: number;
  delivery_address: string;
  delivery_earning: number;
  created_at: string;
  stores: { name: string; address: string };
  profiles: { full_name: string; phone: string };
}

interface Earnings {
  total_deliveries: number;
  completed_deliveries: number;
  total_earnings: number;
}

const Delivery = () => {
  const { user, loading } = useAuth();
  const [availableOrders, setAvailableOrders] = useState<Order[]>([]);
  const [activeOrders, setActiveOrders] = useState<Order[]>([]);
  const [completedOrders, setCompletedOrders] = useState<Order[]>([]);
  const [aiRouteSuggestion, setAiRouteSuggestion] = useState<string>("");
  const [loadingAI, setLoadingAI] = useState(false);
  const [earnings, setEarnings] = useState<Earnings | null>(null);

  useEffect(() => {
    if (user) {
      fetchOrders();
      fetchEarnings();
      
      // Subscribe to real-time order updates
      const channel = supabase
        .channel('orders-channel')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'orders',
          },
          () => {
            fetchOrders();
            fetchEarnings();
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [user]);

  const fetchOrders = async () => {
    if (!user) return;

    // Available orders (ready for pickup, no delivery person assigned)
    const { data: available } = await supabase
      .from('orders')
      .select('*, stores(name, address), profiles!customer_id(full_name, phone)')
      .eq('status', 'ready_for_pickup')
      .is('delivery_person_id', null);

    if (available) setAvailableOrders(available as any);

    // Active orders (assigned to this delivery person, not completed)
    const { data: active } = await supabase
      .from('orders')
      .select('*, stores(name, address), profiles!customer_id(full_name, phone)')
      .eq('delivery_person_id', user.id)
      .in('status', ['picked_up', 'delivering']);

    if (active) setActiveOrders(active as any);

    // Completed orders (delivered by this person)
    const { data: completed } = await supabase
      .from('orders')
      .select('*, stores(name, address), profiles!customer_id(full_name, phone)')
      .eq('delivery_person_id', user.id)
      .eq('status', 'delivered')
      .order('updated_at', { ascending: false })
      .limit(10);

    if (completed) setCompletedOrders(completed as any);
  };

  const fetchEarnings = async () => {
    if (!user) return;
    
    const { data } = await supabase
      .from('delivery_earnings')
      .select('*')
      .eq('delivery_person_id', user.id)
      .single();
    
    if (data) setEarnings(data);
  };

  const acceptOrder = async (orderId: string) => {
    if (!user) return;

    try {
      const { error } = await supabase
        .from('orders')
        .update({
          delivery_person_id: user.id,
          status: 'picked_up',
        })
        .eq('id', orderId);

      if (error) throw error;

      toast.success("Order accepted! Head to the pickup location.");
      fetchOrders();
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const updateOrderStatus = async (orderId: string, newStatus: string) => {
    try {
      const { error } = await supabase
        .from('orders')
        .update({ status: newStatus as any })
        .eq('id', orderId);

      if (error) throw error;

      toast.success(`Order status updated to ${newStatus.replace('_', ' ')}`);
      fetchOrders();
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const getStatusBadge = (status: string) => {
    const statusMap: Record<string, { label: string; variant: "default" | "secondary" | "success" }> = {
      ready_for_pickup: { label: 'Ready for Pickup', variant: 'default' },
      picked_up: { label: 'Picked Up', variant: 'secondary' },
      delivering: { label: 'Delivering', variant: 'secondary' },
      delivered: { label: 'Delivered', variant: 'success' },
    };

    const { label, variant } = statusMap[status] || { label: status, variant: 'default' };
    return <Badge variant={variant as any}>{label}</Badge>;
  };

  const getAIRouteSuggestion = async () => {
    if (activeOrders.length === 0) {
      toast.error("No active orders to optimize");
      return;
    }
    
    setLoadingAI(true);
    try {
      const locations = activeOrders.map(order => ({
        address: order.delivery_address,
        customer: order.profiles.full_name
      }));

      const { data, error } = await supabase.functions.invoke('ai-recommendations', {
        body: {
          type: 'delivery_route',
          data: {
            orderCount: activeOrders.length,
            locations
          }
        }
      });

      if (error) throw error;
      setAiRouteSuggestion(data.suggestion);
    } catch (error: any) {
      toast.error("Failed to get route suggestions");
    } finally {
      setLoadingAI(false);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-background">
      <Header userRole="delivery_person" />

      <main className="container py-8 px-4">
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2 bg-gradient-to-r from-success to-secondary bg-clip-text text-transparent">
            Delivery Dashboard
          </h1>
          <p className="text-muted-foreground">Manage your deliveries and earnings</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Available Orders</CardTitle>
              <Package className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{availableOrders.length}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Active Deliveries</CardTitle>
              <Truck className="h-4 w-4 text-secondary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{activeOrders.length}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Completed Deliveries</CardTitle>
              <CheckCircle className="h-4 w-4 text-success" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-success">{earnings?.completed_deliveries || 0}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Total Earnings</CardTitle>
              <CheckCircle className="h-4 w-4 text-success" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-success">${earnings?.total_earnings?.toFixed(2) || '0.00'}</div>
              <p className="text-xs text-muted-foreground mt-1">From delivered orders</p>
            </CardContent>
          </Card>
        </div>

        {activeOrders.length > 0 && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                AI Route Optimization
              </CardTitle>
              <CardDescription>
                Get smart delivery route suggestions for your active orders
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={getAIRouteSuggestion} disabled={loadingAI} className="mb-4">
                <Sparkles className="h-4 w-4 mr-2" />
                {loadingAI ? "Optimizing..." : "Optimize My Route"}
              </Button>
              {aiRouteSuggestion && (
                <Alert>
                  <Truck className="h-4 w-4" />
                  <AlertTitle>Route Suggestion</AlertTitle>
                  <AlertDescription className="whitespace-pre-line mt-2">
                    {aiRouteSuggestion}
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>
        )}

        <Tabs defaultValue="available">
          <TabsList>
            <TabsTrigger value="available">Available ({availableOrders.length})</TabsTrigger>
            <TabsTrigger value="active">Active ({activeOrders.length})</TabsTrigger>
            <TabsTrigger value="completed">Completed</TabsTrigger>
          </TabsList>

          <TabsContent value="available" className="space-y-4">
            {availableOrders.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  No orders available at the moment. Check back soon!
                </CardContent>
              </Card>
            ) : (
              availableOrders.map((order) => (
                <Card key={order.id}>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-lg">Order #{order.id.slice(0, 8)}</CardTitle>
                        <CardDescription className="mt-1">
                          {new Date(order.created_at).toLocaleString()}
                        </CardDescription>
                      </div>
                      {getStatusBadge(order.status)}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <h4 className="font-medium flex items-center gap-2">
                          <Package className="h-4 w-4 text-primary" />
                          Pickup Location
                        </h4>
                        <p className="text-sm">{order.stores.name}</p>
                        <p className="text-sm text-muted-foreground">{order.stores.address}</p>
                      </div>
                      <div className="space-y-2">
                        <h4 className="font-medium flex items-center gap-2">
                          <MapPin className="h-4 w-4 text-destructive" />
                          Delivery Location
                        </h4>
                        <p className="text-sm">{order.profiles.full_name}</p>
                        <p className="text-sm text-muted-foreground">{order.delivery_address}</p>
                        <p className="text-sm text-muted-foreground">{order.profiles.phone}</p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between pt-4 border-t">
                      <div className="text-lg font-bold">${order.total_amount.toFixed(2)}</div>
                      <Button onClick={() => acceptOrder(order.id)}>
                        Accept Order
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          <TabsContent value="active" className="space-y-4">
            {activeOrders.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  No active deliveries. Accept an order to get started!
                </CardContent>
              </Card>
            ) : (
              activeOrders.map((order) => (
                <Card key={order.id}>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-lg">Order #{order.id.slice(0, 8)}</CardTitle>
                        <CardDescription className="mt-1">
                          {new Date(order.created_at).toLocaleString()}
                        </CardDescription>
                      </div>
                      {getStatusBadge(order.status)}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <h4 className="font-medium flex items-center gap-2">
                          <Package className="h-4 w-4 text-primary" />
                          Pickup Location
                        </h4>
                        <p className="text-sm">{order.stores.name}</p>
                        <p className="text-sm text-muted-foreground">{order.stores.address}</p>
                      </div>
                      <div className="space-y-2">
                        <h4 className="font-medium flex items-center gap-2">
                          <MapPin className="h-4 w-4 text-destructive" />
                          Delivery Location
                        </h4>
                        <p className="text-sm">{order.profiles.full_name}</p>
                        <p className="text-sm text-muted-foreground">{order.delivery_address}</p>
                        <p className="text-sm text-muted-foreground">{order.profiles.phone}</p>
                      </div>
                    </div>
                    <div className="flex gap-2 pt-4 border-t">
                      {order.status === 'picked_up' && (
                        <Button className="flex-1" onClick={() => updateOrderStatus(order.id, 'delivering')}>
                          Start Delivery
                        </Button>
                      )}
                      {order.status === 'delivering' && (
                        <Button className="flex-1" onClick={() => updateOrderStatus(order.id, 'delivered')}>
                          Mark as Delivered
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          <TabsContent value="completed" className="space-y-4">
            {completedOrders.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  No completed deliveries yet. Complete your first delivery to see it here!
                </CardContent>
              </Card>
            ) : (
              completedOrders.map((order) => (
                <Card key={order.id} className="opacity-75">
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-lg">Order #{order.id.slice(0, 8)}</CardTitle>
                        <CardDescription className="mt-1">
                          {new Date(order.created_at).toLocaleString()}
                        </CardDescription>
                      </div>
                      {getStatusBadge(order.status)}
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">{order.stores.name}</p>
                        <p className="text-sm text-muted-foreground">→ {order.delivery_address}</p>
                      </div>
                      <div className="text-lg font-bold">${order.total_amount.toFixed(2)}</div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default Delivery;
