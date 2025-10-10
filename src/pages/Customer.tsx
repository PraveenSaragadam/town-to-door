import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import Header from "@/components/layout/Header";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { toast } from "sonner";
import { MapPin, Search, Star, Plus, Minus, ShoppingCart, Package } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";

interface Store {
  id: string;
  name: string;
  address: string;
  location_lat: number;
  location_lon: number;
  rating_avg: number;
  rating_count: number;
  image_url: string;
}

interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  stock_quantity: number;
  category: string;
  image_url: string;
  store_id: string;
  stores: { name: string };
}

interface CartItem {
  id: string;
  quantity: number;
  price_snapshot: number;
  products: Product;
}

const Customer = () => {
  const { user, loading } = useAuth();
  const [stores, setStores] = useState<Store[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [cartOpen, setCartOpen] = useState(false);
  const [selectedTab, setSelectedTab] = useState("stores");

  useEffect(() => {
    if (user) {
      fetchStores();
      fetchProducts();
      fetchCart();
    }
  }, [user]);

  const fetchStores = async () => {
    const { data } = await supabase
      .from('stores')
      .select('*')
      .eq('is_open', true)
      .order('rating_avg', { ascending: false });
    
    if (data) setStores(data);
  };

  const fetchProducts = async () => {
    const { data } = await supabase
      .from('products')
      .select('*, stores(name)')
      .eq('is_available', true)
      .gt('stock_quantity', 0);
    
    if (data) setProducts(data);
  };

  const fetchCart = async () => {
    if (!user) return;
    
    const { data } = await supabase
      .from('cart_items')
      .select('*, products(*, stores(name))')
      .eq('user_id', user.id);
    
    if (data) setCartItems(data);
  };

  const addToCart = async (product: Product) => {
    if (!user) return;

    try {
      const existingItem = cartItems.find(item => item.products.id === product.id);

      if (existingItem) {
        const { error } = await supabase
          .from('cart_items')
          .update({ quantity: existingItem.quantity + 1 })
          .eq('id', existingItem.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('cart_items')
          .insert({
            user_id: user.id,
            product_id: product.id,
            quantity: 1,
            price_snapshot: product.price,
          });

        if (error) throw error;
      }

      toast.success("Added to cart!");
      fetchCart();
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const updateCartQuantity = async (itemId: string, newQuantity: number) => {
    if (newQuantity === 0) {
      await supabase.from('cart_items').delete().eq('id', itemId);
    } else {
      await supabase.from('cart_items').update({ quantity: newQuantity }).eq('id', itemId);
    }
    fetchCart();
  };

  const filteredProducts = products.filter(product => {
    const matchesSearch = product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         product.stores.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = categoryFilter === 'all' || product.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  const cartTotal = cartItems.reduce((sum, item) => sum + (item.quantity * item.price_snapshot), 0);

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-background">
      <Header cartItemCount={cartItems.length} onCartClick={() => setCartOpen(true)} userRole="customer" />

      <main className="container py-8 px-4">
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2 bg-gradient-primary bg-clip-text text-transparent">
            Discover Local Stores
          </h1>
          <p className="text-muted-foreground">Shop fresh products from your neighborhood</p>
        </div>

        <div className="mb-6 flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search products or stores..."
              className="pl-10"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-full sm:w-[200px]">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              <SelectItem value="groceries">Groceries</SelectItem>
              <SelectItem value="vegetables">Vegetables</SelectItem>
              <SelectItem value="fruits">Fruits</SelectItem>
              <SelectItem value="dairy">Dairy</SelectItem>
              <SelectItem value="bakery">Bakery</SelectItem>
              <SelectItem value="snacks">Snacks</SelectItem>
              <SelectItem value="beverages">Beverages</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Tabs value={selectedTab} onValueChange={setSelectedTab}>
          <TabsList className="mb-6">
            <TabsTrigger value="stores">Nearby Stores</TabsTrigger>
            <TabsTrigger value="products">All Products</TabsTrigger>
          </TabsList>

          <TabsContent value="stores" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {stores.map(store => (
                <Card key={store.id} className="overflow-hidden hover:shadow-lg transition-shadow">
                  <div className="h-48 bg-gradient-to-br from-primary/20 to-secondary/20 flex items-center justify-center">
                    <Package className="h-20 w-20 text-primary/40" />
                  </div>
                  <CardHeader>
                    <CardTitle>{store.name}</CardTitle>
                    <CardDescription className="flex items-center gap-2">
                      <MapPin className="h-4 w-4" />
                      {store.address}
                    </CardDescription>
                  </CardHeader>
                  <CardFooter className="flex justify-between">
                    <div className="flex items-center gap-1">
                      <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                      <span className="font-medium">{store.rating_avg.toFixed(1)}</span>
                      <span className="text-muted-foreground text-sm">({store.rating_count})</span>
                    </div>
                    <Button size="sm" onClick={() => {
                      setSearchQuery(store.name);
                      setSelectedTab("products");
                    }}>
                      View Products
                    </Button>
                  </CardFooter>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="products">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {filteredProducts.map(product => (
                <Card key={product.id} className="overflow-hidden hover:shadow-lg transition-shadow">
                  <div className="h-48 bg-gradient-to-br from-primary/10 to-secondary/10 flex items-center justify-center">
                    <ShoppingCart className="h-16 w-16 text-primary/30" />
                  </div>
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-lg line-clamp-1">{product.name}</CardTitle>
                      <Badge variant="secondary" className="shrink-0">${product.price}</Badge>
                    </div>
                    <CardDescription className="line-clamp-2 text-sm">
                      {product.description}
                    </CardDescription>
                    <div className="flex items-center gap-1 text-sm text-muted-foreground">
                      <Package className="h-3 w-3" />
                      {product.stores.name}
                    </div>
                  </CardHeader>
                  <CardFooter className="pt-0">
                    <Button 
                      className="w-full" 
                      size="sm"
                      onClick={() => addToCart(product)}
                      disabled={product.stock_quantity === 0}
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Add to Cart
                    </Button>
                  </CardFooter>
                </Card>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </main>

      {/* Cart Sheet */}
      <Sheet open={cartOpen} onOpenChange={setCartOpen}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Shopping Cart</SheetTitle>
            <SheetDescription>
              {cartItems.length} items in your cart
            </SheetDescription>
          </SheetHeader>

          <div className="mt-6 space-y-4">
            {cartItems.map(item => (
              <div key={item.id} className="flex gap-4 py-4 border-b">
                <div className="flex-1">
                  <h4 className="font-medium">{item.products.name}</h4>
                  <p className="text-sm text-muted-foreground">{item.products.stores?.name}</p>
                  <p className="text-sm font-medium mt-1">${item.price_snapshot.toFixed(2)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="icon"
                    variant="outline"
                    onClick={() => updateCartQuantity(item.id, item.quantity - 1)}
                  >
                    <Minus className="h-4 w-4" />
                  </Button>
                  <span className="w-8 text-center">{item.quantity}</span>
                  <Button
                    size="icon"
                    variant="outline"
                    onClick={() => updateCartQuantity(item.id, item.quantity + 1)}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}

            {cartItems.length === 0 && (
              <div className="text-center py-12 text-muted-foreground">
                Your cart is empty
              </div>
            )}
          </div>

          {cartItems.length > 0 && (
            <div className="mt-6 space-y-4">
              <Separator />
              <div className="flex justify-between text-lg font-bold">
                <span>Total:</span>
                <span>${cartTotal.toFixed(2)}</span>
              </div>
              <Button className="w-full" size="lg">
                Proceed to Checkout
              </Button>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
};

export default Customer;
