import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import connectDB from "@/lib/mongodb";
import Order from "@/models/Order";

// GET - Fetch user orders
export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, message: "Unauthorized" },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status"); // 'all', 'pending', 'shipping', 'completed', 'cancelled'

    await connectDB();

    let query: any = { userId: session.user.id };
    
    if (status && status !== "all") {
      // Map frontend status to backend status
      const statusMap: Record<string, string> = {
        pending: "pending",
        "to ship": "processing",
        shipping: "shipped",
        completed: "delivered",
        cancelled: "cancelled",
      };
      query.status = statusMap[status.toLowerCase()] || status;
    }

    const orders = await Order.find(query)
      .populate("items.productId")
      .sort({ createdAt: -1 })
      .lean();

    return NextResponse.json({
      success: true,
      data: orders,
    });
  } catch (error: any) {
    console.error("Orders fetch error:", error);
    return NextResponse.json(
      { success: false, message: "Failed to fetch orders" },
      { status: 500 }
    );
  }
}
