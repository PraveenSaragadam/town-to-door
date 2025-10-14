import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Star } from "lucide-react";
import { toast } from "sonner";

interface Order {
  id: string;
  total_amount: number;
  status: string;
  payment_status: string;
  delivery_address: string;
  created_at: string;
  stores: { name: string; id: string };
  delivery_person_id: string | null;
}

interface OrdersTabProps {
  userId?: string;
}

const OrdersTab = ({ userId }: OrdersTabProps) => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [ratingDialogOpen, setRatingDialogOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [ratingType, setRatingType] = useState<"store" | "delivery">("store");

  useEffect(() => {
    if (userId) {
      fetchOrders();
      
      // Real-time order updates
      const channel = supabase
        .channel('customer-orders')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'orders',
            filter: `customer_id=eq.${userId}`
          },
          () => {
            fetchOrders();
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [userId]);

  const fetchOrders = async () => {
    if (!userId) return;
    
    const { data } = await supabase
      .from('orders')
      .select('*, stores(name, id)')
      .eq('customer_id', userId)
      .order('created_at', { ascending: false });
    
    if (data) setOrders(data);
  };

  const handleRateClick = (order: Order, type: "store" | "delivery") => {
    setSelectedOrder(order);
    setRatingType(type);
    setRating(0);
    setComment("");
    setRatingDialogOpen(true);
  };

  const submitRating = async () => {
    if (!selectedOrder || rating === 0) {
      toast.error("Please select a rating");
      return;
    }

    try {
      const rateeId = ratingType === "store" 
        ? selectedOrder.stores.id 
        : selectedOrder.delivery_person_id;

      if (!rateeId) {
        toast.error("Cannot rate at this time");
        return;
      }

      const { error } = await supabase.from('ratings').insert({
        order_id: selectedOrder.id,
        rater_user_id: userId,
        ratee_user_id: rateeId,
        rating,
        rating_type: ratingType,
        comment: comment || null
      });

      if (error) throw error;

      toast.success(`${ratingType === "store" ? "Store" : "Delivery"} rated successfully!`);
      setRatingDialogOpen(false);
      setSelectedOrder(null);
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  return (
    <>
      <div className="space-y-4">
        {orders.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              No orders yet. Start shopping to see your orders here!
            </CardContent>
          </Card>
        ) : (
          orders.map(order => (
            <Card key={order.id}>
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="text-lg">{order.stores.name}</CardTitle>
                    <CardDescription>
                      Order placed on {new Date(order.created_at).toLocaleDateString()}
                    </CardDescription>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold">₹{order.total_amount.toFixed(2)}</p>
                    <div className="flex gap-2 mt-2">
                      <Badge variant={order.payment_status === 'paid' ? 'default' : 'secondary'}>
                        {order.payment_status}
                      </Badge>
                      <Badge variant="outline">{order.status}</Badge>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-4">
                  <span className="font-medium">Delivery to: </span>
                  {order.delivery_address}
                </p>
                
                {order.status === 'delivered' && (
                  <div className="flex gap-2">
                    <Button 
                      size="sm" 
                      variant="outline"
                      onClick={() => handleRateClick(order, "store")}
                    >
                      <Star className="h-4 w-4 mr-2" />
                      Rate Store
                    </Button>
                    {order.delivery_person_id && (
                      <Button 
                        size="sm" 
                        variant="outline"
                        onClick={() => handleRateClick(order, "delivery")}
                      >
                        <Star className="h-4 w-4 mr-2" />
                        Rate Delivery
                      </Button>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>

      <Dialog open={ratingDialogOpen} onOpenChange={setRatingDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Rate {ratingType === "store" ? "Store" : "Delivery Person"}
            </DialogTitle>
            <DialogDescription>
              Share your experience with {ratingType === "store" ? selectedOrder?.stores.name : "the delivery person"}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Rating</Label>
              <div className="flex gap-2">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setRating(star)}
                    className="focus:outline-none transition-transform hover:scale-110"
                  >
                    <Star
                      className={`h-8 w-8 ${
                        star <= rating
                          ? "fill-yellow-400 text-yellow-400"
                          : "text-gray-300"
                      }`}
                    />
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="comment">Comment (Optional)</Label>
              <Textarea
                id="comment"
                placeholder="Share your thoughts..."
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setRatingDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submitRating} disabled={rating === 0}>
              Submit Rating
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default OrdersTab;
