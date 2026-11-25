import { MongoClient, ObjectId } from 'mongodb';
import cors from 'cors';
import express from 'express';
import dotenv from 'dotenv/config';
import Stripe from 'stripe';

import dns from 'node:dns';
dns.setServers(['8.8.8.8', '8.8.4.4']);

const app = express();
const escapeSearchRegex = (value = '') => {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

function buildSearchQuery(search, fields = [], extraFilters = {}) {
  const term = String(search || '').trim();
  const base =
    extraFilters && typeof extraFilters === 'object' ? { ...extraFilters } : {};

  if (!term) return base;

  const safe = escapeSearchRegex(term);
  const or = (Array.isArray(fields) ? fields : [])
    .filter(Boolean)
    .map((field) => ({ [field]: new RegExp(safe, 'i') }));

  if (or.length === 0) return base;
  if (Object.keys(base).length === 0) return { $or: or };

  return { $and: [base, { $or: or }] };
}

app.use(cors());
app.use(express.json());

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);


const PORT = process.env.PORT || 8000;

const client = new MongoClient(process.env.MONGODB_SECRET_URL);

export async function connectToMongoDB() {
  try {
    await client.connect();
    console.log("You successfully connected to MongoDB!");
    return client;
  } catch (err) {
    return;
  }
}

const MongoDB = await connectToMongoDB();
const db = MongoDB.db("assignment-projects");
// const Reviw = db.collection('Reviw')
// const Report = db.collection('Report')
// const Massage = db.collection('Massage')
const UsersData = db.collection("user")
const UserProfiles = db.collection("Profile");
// const Notifications = db.collection('Notifications')
const TeachersAddress = db.collection("Teacher-Address")
const tuitionsCollection = db.collection("Tuitions")
const applicationsCollection = db.collection("Applications")
const StudentsSavedApplications = db.collection("Saved")
const TeacherAndAdminBioCullection = db.collection("Bio")
const StudentAndTeacherPaymentsStutus = db.collection("payments")


//==============================================
//User Requst to Admin
//===============================================
// 1) Get All Users Data
app.get("/GetUsers", async (req, res) => {
  try {
    const users = await UsersData.find({}).sort({ _id: -1 }).toArray();
    res.send(users);
  } catch (error) {
    res.status(500).send({
      message: "Failed to fetch users",
      error: error.message,
    });
  }
});

// 2) Update User Role (student | teacher | admin)
app.patch("/UpdateUserRole/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const { role } = req.body;

    if (!ObjectId.isValid(id)) {
      return res.status(400).send({ message: "Invalid user ID" });
    }

    const result = await UsersData.updateOne(
      { _id: new ObjectId(id) },
      { $set: { role } }
    );

    res.send(result);
  } catch (error) {
    res.status(500).send({
      message: "Failed to update user role",
      error: error.message,
    });
  }
});

// 3) Block / Unblock User
app.patch("/UpdateUserStatus/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const { status } = req.body; // "active" or "blocked"

    if (!ObjectId.isValid(id)) {
      return res.status(400).send({ message: "Invalid user ID" });
    }

    const result = await UsersData.updateOne(
      { _id: new ObjectId(id) },
      { $set: { status, isBlocked: status === "blocked" } }
    );

    res.send(result);
  } catch (error) {
    res.status(500).send({
      message: "Failed to update user status",
      error: error.message,
    });
  }
});

// 4) Update User Payment
app.patch("/UpdateUserPayment/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const { payment } = req.body;

    if (!ObjectId.isValid(id)) {
      return res.status(400).send({ message: "Invalid user ID" });
    }

    const result = await UsersData.updateOne(
      { _id: new ObjectId(id) },
      { $set: { payment: Boolean(payment) } }
    );

    res.send(result);
  } catch (error) {
    res.status(500).send({
      message: "Failed to update user payment",
      error: error.message,
    });
  }
});

// 5) Delete User + Session Delete + Cookie Clear
app.delete("/DeleteUser/:id", async (req, res) => {
  try {
    const id = req.params.id;

    if (!ObjectId.isValid(id)) {
      return res.status(400).send({ message: "Invalid user ID" });
    }

    const objectId = new ObjectId(id);
    const targetUser = await UsersData.findOne({ _id: objectId });
    const result = await UsersData.deleteOne({ _id: objectId });

    // Sessions collection thakle oi user-er session muche dewa
    if (typeof sessionsCollection !== "undefined" && targetUser?.email) {
      await sessionsCollection.deleteMany({
        $or: [
          { email: targetUser.email },
          { userEmail: targetUser.email },
          { userId: id },
        ],
      });
    }

    // Cookie clear kora
    res.clearCookie("token", { path: "/" });
    res.clearCookie("session", { path: "/" });
    res.clearCookie("better-auth.session_token", { path: "/" });

    res.send(result);
  } catch (error) {
    res.status(500).send({
      message: "Failed to delete user",
      error: error.message,
    });
  }
});
//========================================================
//All Sign UP member Profile
//===============================================
// ১. POST: UserProfiles কালেকশনে ডেটা সেভ করা
app.post("/UserProfiles", async (req, res) => {
  try {
    const { verified, ...Profile } = req.body; // verified এখানে রাখা হচ্ছে না
    const result = await UserProfiles.insertOne({
      ...Profile,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    res.status(201).send(result);
  } catch (err) {
    console.error("POST /UserProfile error:", err);
    res.status(500).send({ message: "Error saving profile" });
  }
});

// ২. PATCH: UserProfiles কালেকশনের ডেটা _id দিয়ে আপডেট করা
app.patch("/UsersUpdate/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { _id, verified, ...UpdateUsers } = req.body;

    if (!ObjectId.isValid(id)) {
      return res.status(400).send({ message: "Invalid profile ID" });
    }

    const result = await UserProfiles.updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          ...UpdateUsers,
          updatedAt: new Date(),
        },
      }
    );

    if (result.matchedCount === 0) {
      return res.status(404).send({ message: "Profile not found" });
    }

    res.status(200).send(result);
  } catch (err) {
    console.error("PATCH /UsersUpdate/:id error:", err);
    res.status(500).send({ message: "Error updating profile" });
  }
});

// ৩. GET: email অনুযায়ী UserProfiles থেকে ডেটা আনা
app.get("/UsersGet/:email", async (req, res) => {
  try {
    const email = String(req.params.email || "").trim();

    // টপ-লেভেল email অথবা addedBy.email—যেকোনোটিতে মিললেই আনবে
    const result = await UserProfiles.find({
      $or: [{ email }, { "addedBy.email": email }],
    })
      .sort({ updatedAt: -1, createdAt: -1 })
      .toArray();

    res.status(200).send(result);
  } catch (err) {
    console.error("GET /UsersGet/:email error:", err);
    res.status(500).send({ message: "Error fetching user profile" });
  }
});
//================================================
//Only Teachers Profile
//================================================
// ১. POST: Teacher profile সেভ করা
app.post("/TeachersProfile", async (req, res) => {
  try {
    const TeacherProfile = req.body;
    const result = await TeachersAddress.insertOne({
      ...TeacherProfile,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    res.status(201).send(result);
  } catch (err) {
    console.error("POST /TeachersProfile error:", err);
    res.status(500).send({ message: "Error saving teacher profile" });
  }
});

// ২. PATCH: Teacher profile _id দিয়ে আপডেট করা
app.patch("/TeachersUpdate/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { _id, ...UpdateTeachers } = req.body;

    if (!ObjectId.isValid(id)) {
      return res.status(400).send({ message: "Invalid teacher profile ID" });
    }

    const result = await TeachersAddress.updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          ...UpdateTeachers,
          updatedAt: new Date(),
        },
      }
    );

    if (result.matchedCount === 0) {
      return res.status(404).send({ message: "Teacher profile not found" });
    }

    res.status(200).send(result);
  } catch (err) {
    console.error("PATCH /TeachersUpdate/:id error:", err);
    res.status(500).send({ message: "Error updating teacher profile" });
  }
});

// ৩. GET: email অনুযায়ী teacher profile আনা
app.get("/TeachersProfile/:email", async (req, res) => {
  try {
    const email = String(req.params.email || "").trim();

    const result = await TeachersAddress.find({
      $or: [{ email }, { "addedBy.email": email }],
    })
      .sort({ updatedAt: -1, createdAt: -1 })
      .toArray();

    res.status(200).send(result);
  } catch (err) {
    console.error("GET /TeachersProfile/:email error:", err);
    res.status(500).send({ message: "Error fetching teacher profile" });
  }
});

//======================================================
//Teachers Dashboard 
//=====================================================
// Helper: ObjectId valid kina check kora
function getDocFilterById(id) {
  if (!id || !ObjectId.isValid(id)) {
    return null;
  }
  return { _id: new ObjectId(id) };
}

// Class level group kore match kora
function buildClassLevelMatchers(value) {
  const input = String(value).trim().toLowerCase();
  if (!input) return null;

  const groups = [];

  if (input.includes("hsc") || input.includes("11") || input.includes("12")) {
    groups.push("hsc", "class 11", "class 12", "11-12", "inter");
  }

  if (input.includes("ssc") || input.includes("9") || input.includes("10")) {
    groups.push("ssc", "class 9", "class 10", "9-10");
  }

  if (input.includes("6") || input.includes("7") || input.includes("8")) {
    groups.push("class 6", "class 7", "class 8", "6-8");
  }

  if (
    input.includes("university") ||
    input.includes("admission") ||
    input.includes("honours")
  ) {
    groups.push("university", "admission", "honours", "bachelor");
  }

  const patterns = groups.length ? groups : [input];
  return patterns.map((pattern) => new RegExp(escapeSearchRegex(pattern), "i"));
}

// --- TUITIONS ROUTES ---

// POST: Teacher নতুন Tuition পোস্ট করবে
app.post("/TuitionsPost", async (req, res) => {
  try {
    const {
      _id,
      status,
      verificationStatus,
      Name,
      Email,
      ...tuitionData
    } = req.body || {};

    const title = String(tuitionData.title || "").trim();
    if (!title) {
      return res.status(400).send({ message: "Title is required" });
    }

    const now = new Date();
    const newTuition = {
      ...tuitionData,
      name: String(tuitionData.name || Name || "").trim(),
      email: String(tuitionData.email || Email || "").trim().toLowerCase(),
      title,
      subject: String(tuitionData.subject || "General").trim(),
      location: String(tuitionData.location || "Online").trim(),
      monthlyFee: Number(tuitionData.monthlyFee || 0),
      status: "active", // "active" | "closed"
      verificationStatus: "pending", // "pending" | "verified" | "rejected"
      createdAt: now,
      updatedAt: now,
    };

    const result = await tuitionsCollection.insertOne(newTuition);

    return res.status(201).send({
      message: "Tuition created successfully",
      insertedId: result.insertedId,
      tuition: { _id: result.insertedId, ...newTuition },
    });
  } catch (error) {
    console.error("POST /TuitionsPost error:", error);
    return res.status(500).send({ message: "Failed to create tuition" });
  }
});

// GET: Teacher-এর email দিয়ে তার পোস্ট করা সব Tuition আনা
app.get("/TeacherTeutionsGet/:email", async (req, res) => {
  try {
    const email = decodeURIComponent(req.params.email || "")
      .trim()
      .toLowerCase();

    if (!email) {
      return res.status(400).send({ message: "Email is required" });
    }

    const tuitions = await tuitionsCollection
      .find({
        $or: [{ mentorEmail: email }, { email }, { Email: email }],
      })
      .sort({ createdAt: -1 })
      .toArray();

    return res.status(200).send(tuitions);
  } catch (error) {
    console.error("GET /TeacherTeutionsGet/:email error:", error);
    return res.status(500).send({ message: "Failed to fetch teacher tuitions" });
  }
});

// GET: সব Tuition অথবা search ও filter query দিয়ে আনা
app.get("/TuitionsSearch", async (req, res) => {
  try {
    const {
      search,
      subject,
      classLevel,
      deliveryMode,
      location,
      status,
      verificationStatus,
      limit,
    } = req.query;

    const extraFilters = {};

    if (subject && subject !== "all" && String(subject).trim()) {
      extraFilters.subject = new RegExp(
        escapeSearchRegex(String(subject).trim()),
        "i"
      );
    }

    if (classLevel && classLevel !== "all" && String(classLevel).trim()) {
      const matchers = buildClassLevelMatchers(classLevel);
      if (Array.isArray(matchers) && matchers.length > 0) {
        extraFilters.classLevel = { $in: matchers };
      }
    }

    if (
      deliveryMode &&
      deliveryMode !== "all" &&
      String(deliveryMode).trim()
    ) {
      extraFilters.deliveryMode = new RegExp(
        escapeSearchRegex(String(deliveryMode).trim()),
        "i"
      );
    }

    if (location && String(location).trim()) {
      extraFilters.location = new RegExp(
        escapeSearchRegex(String(location).trim()),
        "i"
      );
    }

    if (status && String(status).trim() && String(status).toLowerCase() !== "all") {
      extraFilters.status = new RegExp(
        `^${escapeSearchRegex(String(status).trim())}$`,
        "i"
      );
    }

    if (
      verificationStatus &&
      String(verificationStatus).trim() &&
      String(verificationStatus).toLowerCase() !== "all"
    ) {
      extraFilters.verificationStatus = new RegExp(
        `^${escapeSearchRegex(String(verificationStatus).trim())}$`,
        "i"
      );
    }

    const query =
      typeof buildSearchQuery === "function"
        ? buildSearchQuery(
            search,
            ["title", "subject", "classLevel", "location", "name"],
            extraFilters
          )
        : extraFilters;

    const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 200);

    const tuitions = await tuitionsCollection
      .find(query)
      .sort({ _id: -1 })
      .limit(safeLimit)
      .toArray();

    return res.status(200).send(tuitions);
  } catch (error) {
    console.error("GET /TuitionsSearch error:", error);
    return res.status(500).send({
      message: "Failed to fetch tuitions",
      error: error instanceof Error ? error.message : "Unknown server error",
    });
  }
});;

// GET: id দিয়ে একটি Tuition আনা
app.get("/TuitionsDetails/:id", async (req, res) => {
  try {
    const filter = getDocFilterById(req.params.id);
    if (!filter) {
      return res.status(400).send({ message: "Invalid tuition ID" });
    }

    const tuition = await tuitionsCollection.findOne(filter);
    if (!tuition) {
      return res.status(404).send({ message: "Tuition not found" });
    }

    return res.status(200).send(tuition);
  } catch (error) {
    console.error("GET /TuitionsDetails/:id error:", error);
    return res.status(500).send({ message: "Failed to fetch tuition" });
  }
});

// PATCH: Teacher নিজের Tuition "active" বা "closed" করবে
app.patch("/TuitionsStutus/:id/status", async (req, res) => {
  try {
    const filter = getDocFilterById(req.params.id);
    if (!filter) {
      return res.status(400).send({ message: "Invalid tuition ID" });
    }

    const { status } = req.body || {};
    if (!["active", "closed"].includes(status)) {
      return res.status(400).send({ message: "Use 'active' or 'closed'" });
    }

    const result = await tuitionsCollection.updateOne(filter, {
      $set: { status, updatedAt: new Date() },
    });

    if (result.matchedCount === 0) {
      return res.status(404).send({ message: "Tuition not found" });
    }

    return res
      .status(200)
      .send({ message: `Status changed to ${status}`, status, result });
  } catch (error) {
    console.error("PATCH /TuitionsStutus/:id/status error:", error);
    return res.status(500).send({ message: "Failed to update status" });
  }
});

// PATCH: Teacher id দিয়ে Tuition এডিট করা
app.patch("/TuitionsEdit/:id", async (req, res) => {
  try {
    const filter = getDocFilterById(req.params.id);
    if (!filter) {
      return res.status(400).send({ message: "Invalid tuition ID" });
    }

    const { _id, status, verificationStatus, ...updateData } = req.body || {};
    if (updateData.monthlyFee !== undefined) {
      updateData.monthlyFee = Number(updateData.monthlyFee) || 0;
    }
    if (typeof updateData.title === "string") {
      updateData.title = updateData.title.trim();
    }

    const result = await tuitionsCollection.updateOne(filter, {
      $set: { ...updateData, updatedAt: new Date() },
    });

    if (result.matchedCount === 0) {
      return res.status(404).send({ message: "Tuition not found" });
    }

    return res.status(200).send({ message: "Tuition updated", result });
  } catch (error) {
    console.error("PATCH /TuitionsEdit/:id error:", error);
    return res.status(500).send({ message: "Failed to update tuition" });
  }
});

// PATCH: Admin Tuition verify / approve / revoke / reject করবে
app.patch("/TuitionsTest/:id/verify", async (req, res) => {
  try {
    const filter = getDocFilterById(req.params.id);
    if (!filter) {
      return res.status(400).send({ message: "Invalid tuition ID" });
    }

    const { verificationStatus } = req.body || {};
    const allowed = [
      "pending",
      "verified",
      "approved",
      "revoked",
      "rejected",
    ];
    if (!allowed.includes(verificationStatus)) {
      return res.status(400).send({
        message: "Invalid verification status",
      });
    }

    const now = new Date();
    const isApproved =
      verificationStatus === "verified" || verificationStatus === "approved";

    const result = await tuitionsCollection.updateOne(filter, {
      $set: {
        verificationStatus,
        verifiedAt: isApproved ? now : null,
        updatedAt: now,
      },
    });

    if (result.matchedCount === 0) {
      return res.status(404).send({ message: "Tuition not found" });
    }

    return res.status(200).send({
      message: `Tuition ${verificationStatus}`,
      verificationStatus,
      result,
    });
  } catch (error) {
    console.error("PATCH /TuitionsTest/:id/verify error:", error);
    return res.status(500).send({ message: "Failed to verify tuition" });
  }
});

// DELETE: Teacher বা Admin Tuition ডিলিট করবে
app.delete("/TuitionsDelete/:id", async (req, res) => {
  try {
    const filter = getDocFilterById(req.params.id);
    if (!filter) {
      return res.status(400).send({ message: "Invalid tuition ID" });
    }

    const result = await tuitionsCollection.deleteOne(filter);
    if (result.deletedCount === 0) {
      return res.status(404).send({ message: "Tuition not found" });
    }

    return res.status(200).send({ message: "Tuition deleted", result });
  } catch (error) {
    console.error("DELETE /TuitionsDelete/:id error:", error);
    return res.status(500).send({ message: "Failed to delete tuition" });
  }
});

// --- APPLICATIONS ROUTES ---
//======================================================
// Apply Now (student -> tuition)
//=====================================================

// POST: Student Apply Post tuitions
app.post("/ApplyPost", async (req, res) => {
  try {
    const body = req.body || {};
    const tuitionId = String(body.tuitionId || "").trim();
    const studentName = String(body.studentName || "").trim();
    const studentEmail = String(body.studentEmail || "").trim().toLowerCase();

    if (!ObjectId.isValid(tuitionId)) {
      return res.status(400).send({ message: "Invalid tuition id" });
    }

    if (!studentName || !studentEmail) {
      return res.status(400).send({ message: "Name and email are required" });
    }

    const [user, tuition, alreadyApplied] = await Promise.all([
      UsersData.findOne(
        { email: studentEmail },
        { projection: { payment: 1, planExpiresAt: 1, activePlanKey: 1 } }
      ),
      tuitionsCollection.findOne({ _id: new ObjectId(tuitionId) }),
      applicationsCollection.findOne(
        { tuitionId, studentEmail },
        { projection: { _id: 1 } }
      ),
    ]);

    if (!tuition) {
      return res.status(404).send({ message: "Tuition not found" });
    }

    if (tuition.status !== "active") {
      return res.status(400).send({ message: "This tuition is closed" });
    }

    if (alreadyApplied) {
      return res
        .status(400)
        .send({ message: "You have already applied for this tuition" });
    }

    // হিন্ট: Pro কি না তা এখন paid রশিদ/planExpiresAt থেকে ঠিক করা হচ্ছে।
    // আগে শুধু UsersData.payment ফ্ল্যাগ দেখা হতো, যা Stripe পেমেন্টের পর true হতো না —
    // তাই প্ল্যান কেনার পরেও ২টি Apply শেষ হলে ইউজার আবার Pricing পেজে চলে যেত।
    const planStatus = await syncUserPlanFromReceipts(studentEmail);
    const isPro = planStatus.isActivePlan || Boolean(user?.payment);

    if (!isPro) {
      const appliedCount = await applicationsCollection.countDocuments({
        studentEmail,
        post: { $ne: false },
      });

      if (appliedCount >= FREE_LIMIT) {
        return res.status(403).send({
          limitReached: true,
          message:
            "Free plan allows up to 2 applications. Upgrade to Pro for unlimited apply.",
        });
      }
    }

    const now = new Date();
    const application = {
      tuitionId,
      tuitionTitle: tuition.title,
      subject: tuition.subject,
      classLevel: tuition.classLevel,
      monthlyFee: tuition.monthlyFee,
      teacherId: tuition.mentorId || "",
      teacherEmail: String(tuition.email || "").trim().toLowerCase(),
      mentorName: tuition.name || "",
      studentName,
      studentEmail,
      studentId: body.studentId || "",
      phone: body.phone || "",
      sessionTime: body.sessionTime || "",
      message: body.message || "",
      status: "pending",
      post: true,
      createdAt: now,
      updatedAt: now,
    };

    await applicationsCollection.insertOne(application);
    return res.status(201).send({ message: "Application sent successfully" });
  } catch (error) {
    console.error("ApplyPost error:", error);
    return res.status(500).send({ message: "Something went wrong" });
  }
});

// GET: Student er sob application (+ optional ?search= & ?status=)
app.get("/ApplyGet/:email", async (req, res) => {
  try {
    const email = decodeURIComponent(req.params.email || "")
      .trim()
      .toLowerCase();

    if (!email) {
      return res.status(400).send({ message: "Email is required" });
    }

    const extraFilters = { studentEmail: email };
    if (req.query.status && req.query.status !== "all") {
      extraFilters.status = String(req.query.status).trim();
    }

    const query = buildSearchQuery(
      req.query.search,
      ["tuitionTitle", "subject", "mentorName"],
      extraFilters
    );

    const list = await applicationsCollection
      .find(query)
      .sort({ createdAt: -1 })
      .limit(100)
      .toArray();

    return res.status(200).send(list);
  } catch (error) {
    console.error("ApplyGet error:", error);
    return res.status(500).send({ message: "Something went wrong" });
  }
});

// PATCH: Student application-er `post` (true / false) update kora
app.patch("/StudentApplicationPost/:id", async (req, res) => {
  try {
    const filter = getDocFilterById(req.params.id);
    if (!filter) {
      return res.status(400).send({ message: "Invalid application id" });
    }

    const { post } = req.body || {};
    const result = await applicationsCollection.updateOne(filter, {
      $set: { post: Boolean(post), updatedAt: new Date() },
    });

    if (result.matchedCount === 0) {
      return res.status(404).send({ message: "Application not found" });
    }

    return res.status(200).send({ message: "Post status updated", result });
  } catch (error) {
    console.error("StudentApplicationPost error:", error);
    return res.status(500).send({ message: "Something went wrong" });
  }
});

// DELETE: Student shudhu `status: "pending"` thaklei application delete korte parbe
app.delete("/StudentApplicationDelete/:id", async (req, res) => {
  try {
    const filter = getDocFilterById(req.params.id);
    if (!filter) {
      return res.status(400).send({ message: "Invalid application id" });
    }

    const appDoc = await applicationsCollection.findOne(filter, {
      projection: { status: 1 },
    });

    if (!appDoc) {
      return res.status(404).send({ message: "Application not found" });
    }

    if (appDoc.status !== "pending") {
      return res.status(400).send({
        message: "Only pending applications can be deleted",
      });
    }

    const result = await applicationsCollection.deleteOne(filter);
    return res
      .status(200)
      .send({ message: "Pending application deleted", result });
  } catch (error) {
    console.error("StudentApplicationDelete error:", error);
    return res.status(500).send({ message: "Something went wrong" });
  }
});

// GET: Teacher er tuition gulo te asha sob active application (+ optional ?search= & ?status=)
app.get("/TeacherApplicationsGet/:email", async (req, res) => {
  try {
    const email = decodeURIComponent(req.params.email || "")
      .trim()
      .toLowerCase();

    if (!email) {
      return res.status(400).send({ message: "Email is required" });
    }

    const extraFilters = {
      teacherEmail: email,
      post: { $ne: false },
    };

    if (req.query.status && req.query.status !== "all") {
      extraFilters.status = String(req.query.status).trim();
    }

    const query = buildSearchQuery(
      req.query.search,
      ["studentName", "studentEmail", "tuitionTitle", "subject"],
      extraFilters
    );

    const list = await applicationsCollection
      .find(query)
      .sort({ createdAt: -1 })
      .limit(100)
      .toArray();

    return res.status(200).send(list);
  } catch (error) {
    console.error("TeacherApplicationsGet error:", error);
    return res.status(500).send({ message: "Something went wrong" });
  }
});

// PATCH: Teacher application accept / reject korbe
app.patch("/ApplyStatus/:id", async (req, res) => {
  try {
    const filter = getDocFilterById(req.params.id);
    if (!filter) {
      return res.status(400).send({ message: "Invalid application id" });
    }

    const status = req.body?.status; // pending | accepted | rejected
    if (!["pending", "accepted", "rejected"].includes(status)) {
      return res
        .status(400)
        .send({ message: "Status must be pending, accepted or rejected" });
    }

    const result = await applicationsCollection.updateOne(filter, {
      $set: { status, updatedAt: new Date() },
    });

    if (result.matchedCount === 0) {
      return res.status(404).send({ message: "Application not found" });
    }

    return res.status(200).send({ message: "Application " + status });
  } catch (error) {
    console.error("ApplyStatus error:", error);
    return res.status(500).send({ message: "Something went wrong" });
  }
});
//=================================================
//Saved Tutions and Delete saved Tutions
//===================================================
app.post("/SavedTuitions", async (req, res) => {
  try {
    const savedData = req.body;
    const studentEmail = String(
      savedData.studentEmail || savedData.email || ""
    )
      .trim()
      .toLowerCase();

    if (!studentEmail || !savedData.tuitionId) {
      return res
        .status(400)
        .json({ message: "studentEmail and tuitionId are required" });
    }

    // Ek-i student ek-i tuition duibar save korte parbe na
    const alreadySaved = await StudentsSavedApplications.findOne({
      studentEmail,
      tuitionId: String(savedData.tuitionId),
    });

    if (alreadySaved) {
      return res.status(409).json({
        alreadySaved: true,
        savedId: alreadySaved._id,
        message: "This tuition is already in your saved list.",
      });
    }

    // Pro না হলে সর্বোচ্চ 2টা bookmark লিমিট চেক
    // হিন্ট: Pro status রশিদ/planExpiresAt থেকে নেওয়া হচ্ছে (আগে শুধু payment ফ্ল্যাগ
    // দেখত, যা Stripe পেমেন্টের পর true হতো না — তাই পেমেন্ট করেও 2টার বেশি save করা যেত না)।
    const user = await UsersData.findOne({ email: studentEmail });
    const planStatus = await syncUserPlanFromReceipts(studentEmail);
    const isPro = planStatus.isActivePlan || Boolean(user?.payment);

    if (!isPro) {
      const count = await StudentsSavedApplications.countDocuments({
        studentEmail,
      });

      if (count >= 2) {
        return res.status(403).json({
          limitReached: true,
          message: "Free plan allows up to 2 saved tuitions.",
        });
      }
    }

    const doc = {
      ...savedData,
      tuitionId: String(savedData.tuitionId),
      studentEmail,
      createdAt: new Date(),
    };
    delete doc._id;

    const result = await StudentsSavedApplications.insertOne(doc);
    return res.status(201).json({ insertedId: result.insertedId, saved: doc });
  } catch (err) {
    console.error("POST /SavedTuitions error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

// 1) id (studentEmail ba tuitionId/id) diye saved tuitions ana
app.get("/SavedTuitionsGet/:id", async (req, res) => {
  try {
    const rawId = decodeURIComponent(String(req.params.id || "")).trim();

    if (!rawId) {
      return res.status(400).send({ message: "id is required" });
    }

    const normalizedEmail = rawId.toLowerCase();

    const items = await StudentsSavedApplications
      .find({
        $or: [
          { studentEmail: normalizedEmail },
          { email: normalizedEmail },
          { tuitionId: rawId },
          ...(ObjectId.isValid(rawId) ? [{ _id: new ObjectId(rawId) }] : []),
        ],
      })
      .sort({ createdAt: -1 })
      .toArray();

    return res.status(200).send(items);
  } catch (error) {
    console.log("SavedTuitionsGet/:id error:", error);
    return res.status(500).send({ message: "Server error" });
  }
});

// Query style alias: /GetSavedTuitions?email=student@mail.com
app.get("/GetSavedTuitions", async (req, res) => {
  try {
    const email = String(req.query?.email || "").trim().toLowerCase();

    if (!email) {
      return res.status(400).send({ message: "email is required" });
    }

    const items = await StudentsSavedApplications
      .find({ $or: [{ studentEmail: email }, { email }] })
      .sort({ createdAt: -1 })
      .toArray();

    return res.status(200).send(items);
  } catch (error) {
    console.log("GetSavedTuitions error:", error);
    return res.status(500).send({ message: "Server error" });
  }
});

// 2) :id diye saved tuition delete kora (saved doc _id / tuitionId / id)
app.delete("/SavedTuitionsDelete/:id", async (req, res) => {
  try {
    const rawId = decodeURIComponent(String(req.params.id || "")).trim();
    const email = String(req.query?.email || "").trim().toLowerCase();

    if (!rawId) {
      return res.status(400).send({ message: "ID is required" });
    }

    const idConditions = [{ tuitionId: rawId }, { id: rawId }];
    if (ObjectId.isValid(rawId)) {
      idConditions.push({ _id: new ObjectId(rawId) });
    }

    const filter = email
      ? {
          $and: [
            { $or: idConditions },
            { $or: [{ studentEmail: email }, { email }] },
          ],
        }
      : { $or: idConditions };

    const result = await StudentsSavedApplications.deleteOne(filter);

    if (result.deletedCount === 0) {
      return res.status(404).send({ message: "Saved tuition not found" });
    }

    return res.status(200).send({
      message: "Deleted from saved tuitions",
      deletedCount: result.deletedCount,
    });
  } catch (error) {
    console.error("DELETE /SavedTuitionsDelete error:", error);
    return res.status(500).send({ message: "Failed to delete saved tuition" });
  }
});

//===========================================
//Post and Apply tutions Count
//==========================================
const FREE_LIMIT = 2;

function hasActivePlan(user) {
  if (!user?.planExpiresAt) return false;
  return new Date(user.planExpiresAt).getTime() > Date.now();
}

// আপনার চেনা app.get স্টাইলেই Teacher-এর Post Count
app.get("/GetPostCount/:email", async (req, res) => {
  try {
    const email = decodeURIComponent(req.params.email || "").trim();
    const emailRegex = new RegExp(`^${escapeSearchRegex(email)}$`, "i");

    // হিন্ট: planExpiresAt stale থাকতে পারে, তাই রশিদ থেকে সত্যিকারের স্ট্যাটাস নেওয়া হচ্ছে।
    const planStatus = await syncUserPlanFromReceipts(email);
    const user = await UsersData.findOne({ email: emailRegex });
    const activePlan = planStatus.isActivePlan || hasActivePlan(user);

    const postCount = await tuitionsCollection.countDocuments({
      $or: [{ teacherEmail: emailRegex }, { email: emailRegex }, { Email: emailRegex }],
    });

    return res.send({
      postCount,
      hasActivePlan: activePlan,
      canPostMore: activePlan || postCount < FREE_LIMIT,
      freeLimit: FREE_LIMIT,
    });
  } catch (err) {
    res.status(500).send({ message: "Error getting post count" });
  }
});

// আপনার চেনা app.get স্টাইলেই Student-এর Apply Count
app.get("/GetApplyCount/:email", async (req, res) => {
  try {
    const email = decodeURIComponent(req.params.email || "").trim();
    const emailLower = email.toLowerCase();
    const emailRegex = new RegExp(`^${escapeSearchRegex(email)}$`, "i");

    // হিন্ট: এখানেও রশিদ-ভিত্তিক প্ল্যান স্ট্যাটাস ব্যবহার করা হচ্ছে, যাতে
    // "GetApplyCount বলে apply করতে পারবে" কিন্তু ApplyPost আটকে দেয় — এমন বিরোধ না থাকে।
    const planStatus = await syncUserPlanFromReceipts(emailLower);
    const user = await UsersData.findOne({ email: emailRegex });
    const activePlan = planStatus.isActivePlan || hasActivePlan(user);

    const applyCount = await applicationsCollection.countDocuments({
      studentEmail: emailRegex,
    });

    return res.send({
      applyCount,
      hasActivePlan: activePlan,
      canApplyMore: activePlan || applyCount < FREE_LIMIT,
      freeLimit: FREE_LIMIT,
    });
  } catch (err) {
    res.status(500).send({ message: "Error getting apply count" });
  }
});

//=============================================================
//STRIPE AR SESSION AND CHEKING AND ROSID SAVE TO BACKEND
//========================================================
// হিন্ট: বর্তমান সময় অনুযায়ী ইউজারের প্ল্যান সক্রিয় (active) কি না তা চেক করার helper।
// হিন্ট: মেয়াদ শেষ হলে প্ল্যান যেন সাথে সাথে inactive দেখায়।
// হিন্ট: planExpiresAt-এর সাথে Date.now() তুলনা করা হয়েছে।
function isPlanActive(planExpiresAt) {
  return Boolean(planExpiresAt) && new Date(planExpiresAt).getTime() > Date.now();
}

// হিন্ট: প্ল্যান active কি না তার একমাত্র সত্য উৎস হলো paid রশিদ (payments কালেকশন)।
// হিন্ট: payment রেকর্ড ডিলিট/রিভার্স হলে UsersData-তে রয়ে যাওয়া পুরনো planExpiresAt
//        ইউজারকে চিরতরে "Pro" বানিয়ে রাখত — তাই সেই stale ডেটা এখানে পরিষ্কার করা হচ্ছে।
// হিন্ট: সব paid রশিদের মধ্যে সবচেয়ে বড় ভবিষ্যৎ planExpiresAt ধরে UsersData আপডেট করা হয়েছে।
async function syncUserPlanFromReceipts(rawEmail) {
  const userEmail = String(rawEmail || "").trim().toLowerCase();

  if (!userEmail) {
    return { isActivePlan: false, activePlanKey: null, planExpiresAt: null };
  }

  const paidReceipts = await StudentAndTeacherPaymentsStutus
    .find({ email: userEmail, payment: true })
    .toArray();

  const now = Date.now();
  const latest =
    paidReceipts
      .filter(
        (receipt) =>
          receipt?.planExpiresAt &&
          new Date(receipt.planExpiresAt).getTime() > now
      )
      .sort(
        (a, b) =>
          new Date(b.planExpiresAt).getTime() -
          new Date(a.planExpiresAt).getTime()
      )[0] || null;

  const planExpiresAt = latest ? new Date(latest.planExpiresAt) : null;
  const activePlanKey = latest ? latest.planKey || null : null;

  await UsersData.updateOne(
    { email: userEmail },
    { $set: { activePlanKey, planExpiresAt, updatedAt: new Date() } }
  );

  return {
    isActivePlan: Boolean(latest),
    activePlanKey,
    planExpiresAt,
  };
}

// হিন্ট: Stripe redirect-এর জন্য অ্যাপের base URL পরিষ্কারভাবে নেওয়া হচ্ছে।
// হিন্ট: শেষে extra slash থাকলে ভুল URL তৈরি হতে পারে।
// হিন্ট: .replace(/\/+$/, "") দিয়ে শেষের slash কাটা হয়েছে।
const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/+$/, "");

// হিন্ট: নির্বাচিত প্ল্যানের জন্য Stripe Checkout Session তৈরি করা হচ্ছে।
// হিন্ট: active paid প্ল্যান থাকলে Stripe-এ যেতে দেওয়া হবে না; মেয়াদ শেষ হলে আবার যেতে পারবে।
// হিন্ট: আগে syncUserPlanFromReceipts দিয়ে active plan চেক করে session তৈরি করা হয়েছে।
app.post("/CreateCheckoutSession", async (req, res) => {
  try {
    const {
      email,
      name,
      image,
      role,
      planKey,
      planLabel,
      amount,
      currency = "usd",
      durationDays = 30,
      returnTo = "/",
    } = req.body || {};

    if (!email || !planKey || !amount) {
      return res
        .status(400)
        .json({ error: "email, planKey, and amount are required" });
    }

    const cleanEmail = String(email).trim().toLowerCase();
    const currentPlan = await syncUserPlanFromReceipts(cleanEmail);

    if (currentPlan.isActivePlan) {
      return res.status(403).json({
        error: "You already have an active plan until expiration",
        planExpiresAt: currentPlan.planExpiresAt,
      });
    }

    const days = Number(durationDays) || 30;

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: cleanEmail,
      line_items: [
        {
          price_data: {
            currency: String(currency).toLowerCase(),
            product_data: { name: planLabel || planKey },
            unit_amount: Math.round(Number(amount) * 100),
          },
          quantity: 1,
        },
      ],
      metadata: {
        email: cleanEmail,
        name: name || "",
        image: image || "",
        role: role || "student",
        planKey,
        durationDays: String(days),
        returnTo,
      },
      success_url: `${APP_URL}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${APP_URL}/pricing`,
    });

    return res.status(200).json({ url: session.url, sessionId: session.id });
  } catch (err) {
    console.error("POST /CreateCheckoutSession error:", err);
    return res.status(500).json({ error: "Failed to create Stripe session" });
  }
});

// হিন্ট: প্রথমবার ১টি pending রেকর্ড সেভ হবে; পরে পেমেন্ট না করে ফিরলে ওই একই pending আপডেট হবে।
// হিন্ট: বারবার ফিরে এলে যেন ডাটাবেসে একাধিক pending না জমে এবং active plan থাকলে নতুন pending না হয়।
// হিন্ট: payment: false, status: "pending" ফিল্টারে upsert: true দিয়ে updateOne করা হয়েছে।
app.post("/PaymentPending", async (req, res) => {
  try {
    const {
      email,
      name,
      image,
      role,
      planKey,
      amount,
      currency = "usd",
      durationDays,
      returnTo,
    } = req.body || {};

    if (!email || !planKey) {
      return res.status(400).json({ error: "email and planKey are required" });
    }

    const cleanEmail = String(email).trim().toLowerCase();
    const currentPlan = await syncUserPlanFromReceipts(cleanEmail);

    if (currentPlan.isActivePlan) {
      return res.status(200).json({
        skipped: true,
        payment: true,
        message: "Active plan already exists",
      });
    }

    const now = new Date();
    const pendingDoc = {
      email: cleanEmail,
      name: name || "",
      image: image || "",
      role: role || "student",
      planKey,
      amountTotal: Number(amount) || 0,
      currency: String(currency || "usd").toUpperCase(),
      durationDays: Number(durationDays) || 30,
      payment: false,
      status: "pending",
      returnTo: returnTo || "/",
      updatedAt: now,
    };

    const result = await StudentAndTeacherPaymentsStutus.updateOne(
      {
        email: cleanEmail,
        payment: false,
        status: "pending",
      },
      {
        $set: pendingDoc,
        $setOnInsert: { createdAt: now },
      },
      { upsert: true }
    );

    return res.status(200).json({
      upsertedId: result.upsertedId || null,
      payment: false,
      status: "pending",
    });
  } catch (err) {
    console.error("POST /PaymentPending error:", err);
    return res.status(500).json({ error: "Failed to save pending payment" });
  }
});

// হিন্ট: Stripe পেমেন্ট যাচাই করে বিদ্যমান pending রেকর্ডকেই paid হিসেবে আপডেট করা হচ্ছে।
// হিন্ট: পেমেন্ট সফল হলে আলাদা রেকর্ড না জমিয়ে আগের pending-টাই আপডেট হয়ে paid হবে।
// হিন্ট: আগে pending রেকর্ড খুঁজে সেটিই paid করা হয়েছে, না পেলে sessionId দিয়ে upsert করা হয়েছে।
app.post("/VerifyPayment", async (req, res) => {
  try {
    const { sessionId, email } = req.body || {};
    if (!sessionId) {
      return res.status(400).json({ error: "sessionId is required" });
    }

    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (session.payment_status !== "paid") {
      return res.status(400).json({
        verified: false,
        payment: false,
        message: "Payment is not completed yet",
      });
    }

    const meta = session.metadata || {};
    const userEmail = String(
      email || meta.email || session.customer_email || ""
    )
      .trim()
      .toLowerCase();

    if (!userEmail) {
      return res.status(400).json({ error: "User email is missing" });
    }

    const userDoc = await UsersData.findOne({ email: userEmail });
    const durationDays = Number(meta.durationDays) || 30;
    const now = new Date();
    const planExpiresAt = new Date(
      now.getTime() + durationDays * 24 * 60 * 60 * 1000
    );

    const paidFields = {
      receiptId: `RCPT-${session.id.slice(-8).toUpperCase()}`,
      sessionId: session.id,
      email: userEmail,
      name: meta.name || userDoc?.name || "",
      image: meta.image || userDoc?.image || "",
      role: meta.role || userDoc?.role || "student",
      planKey: meta.planKey || "student_1m",
      durationDays,
      amountTotal: session.amount_total ? session.amount_total / 100 : 0,
      currency: (session.currency || "usd").toUpperCase(),
      payment: true,
      status: "paid",
      paidAt: now,
      updatedAt: now,
      planExpiresAt,
      returnTo: meta.returnTo || "/",
    };

    // হিন্ট: আগের pending রেকর্ড খোঁজা হচ্ছে — status ফিল্ডের বানান/কেস যাই হোক,
    // payment !== true হলেই সেটাকে pending ধরা হচ্ছে, যাতে একই পেমেন্টের জন্য
    // ডুপ্লিকেট paid রশিদ তৈরি না হয় (পুরনো রেকর্ডে status ভিন্ন হলে আগে নতুন
    // ডকুমেন্ট তৈরি হয়ে যেত)।
    const existingPending = await StudentAndTeacherPaymentsStutus.findOne(
      { email: userEmail, payment: { $ne: true } },
      { sort: { updatedAt: -1, createdAt: -1 } }
    );

    if (existingPending) {
      await StudentAndTeacherPaymentsStutus.updateOne(
        { _id: existingPending._id },
        { $set: paidFields }
      );
    } else {
      await StudentAndTeacherPaymentsStutus.updateOne(
        { sessionId: session.id },
        {
          $set: paidFields,
          $setOnInsert: { createdAt: now },
        },
        { upsert: true }
      );
    }

    const receipt = existingPending
      ? { ...existingPending, ...paidFields }
      : { createdAt: now, ...paidFields };

    // হিন্ট: রশিদ সেভ হওয়ার পর paid রশিদ থেকেই UsersData-র প্ল্যান মেয়াদ হিসাব করা হচ্ছে।
    // হিন্ট: ফলে পেমেন্ট ডিলিট/রিভার্স হলেও ইউজার ভুলভাবে Pro থাকবে না।
    await syncUserPlanFromReceipts(userEmail);

    return res.status(200).json({
      verified: true,
      payment: true,
      isActivePlan: true,
      receipt,
      returnTo: receipt.returnTo,
    });
  } catch (err) {
    console.error("POST /VerifyPayment error:", err);
    return res.status(500).json({ error: "Payment verification failed" });
  }
});

// হিন্ট: ইউজারের বর্তমান প্ল্যান active কি না ও কবে শেষ হবে তা জানানো হচ্ছে।
// হিন্ট: ফ্রন্টএন্ডে active status ও expiry তারিখ দেখাতে।
// হিন্ট: paid রশিদ থেকে মেয়াদ হিসাব করা হয়, তাই ডিলিট হওয়া পেমেন্ট আর
//        "Pro active" দেখাবে না (guard: syncUserPlanFromReceipts)।
app.get("/GetPlanStatus/:email", async (req, res) => {
  try {
    const userEmail = String(req.params.email || "").trim().toLowerCase();
    const { isActivePlan, activePlanKey, planExpiresAt } =
      await syncUserPlanFromReceipts(userEmail);

    return res.status(200).json({
      email: userEmail,
      isActivePlan,
      activePlanKey,
      planExpiresAt,
    });
  } catch (err) {
    console.error("GET /GetPlanStatus error:", err);
    return res.status(500).json({ error: "Failed to get plan status" });
  }
});

// হিন্ট: নির্দিষ্ট ইউজারের paid ও pending রশিদগুলো নতুন থেকে পুরনো ক্রমে আনা হচ্ছে।
// হিন্ট: Student ও Teacher প্রোফাইলে রশিদ কার্ড দেখাতে।
// হিন্ট: email অনুযায়ী রশিদ এনে sort({ paidAt: -1, updatedAt: -1 }) করে পাঠানো হয়েছে।
app.get("/GetReceipts/:email", async (req, res) => {
  try {
    const userEmail = String(req.params.email || "").trim().toLowerCase();
    const receipts = await StudentAndTeacherPaymentsStutus.find({
      email: userEmail,
      $or: [{ payment: true }, { status: "pending" }],
    })
      .sort({ paidAt: -1, updatedAt: -1, createdAt: -1 })
      .toArray();

    return res.status(200).json({ receipts });
  } catch (err) {
    console.error("GET /GetReceipts error:", err);
    return res.status(500).json({ error: "Failed to fetch receipts" });
  }
});

// হিন্ট: Admin Payment পেজের জন্য সব পেমেন্ট রেকর্ড আনা হচ্ছে।
// হিন্ট: অ্যাডমিন যেন সব ইউজারের পেমেন্ট ও ছবি দেখতে পারে।
// হিন্ট: StudentAndTeacherPaymentsStutus থেকে sort({ createdAt: -1 }) করে ফেরত দেওয়া হয়েছে।
app.get("/AdminViewPayments", async (req, res) => {
  try {
    const payments = await StudentAndTeacherPaymentsStutus.find({})
      .sort({ createdAt: -1 })
      .toArray();

    return res.status(200).json({ payments });
  } catch (err) {
    console.error("GET /AdminViewPayments error:", err);
    return res.status(500).json({ error: "Failed to fetch payments" });
  }
});

// হিন্ট: Admin প্যানেল থেকে কোনো পেমেন্টের status paid/pending আপডেট করা হচ্ছে।
// হিন্ট: অ্যাডমিন ম্যানুয়ালি পেমেন্ট স্ট্যাটাস পরিবর্তন করতে চাইলে।
// হিন্ট: ObjectId যাচাই করে updateOne দিয়ে status ও payment আপডেট করা হয়েছে।
app.patch("/UpdatePaymentStatus/:id", async (req, res) => {
  try {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid payment id" });
    }

    const existing = await StudentAndTeacherPaymentsStutus.findOne({
      _id: new ObjectId(id),
    });
    if (!existing) {
      return res.status(404).json({ message: "Payment not found" });
    }

    const { status, payment } = req.body || {};
    const nextStatus = String(status || "").trim().toLowerCase();
    const isPaid =
      typeof payment === "boolean" ? payment : nextStatus === "paid";

    // হিন্ট: অ্যাডমিন paid করলে রশিদে মেয়াদ না থাকলে সেটিও তৈরি করা হচ্ছে।
    // হিন্ট: pending/refund হলে planExpiresAt null হয়ে ইউজারের প্ল্যান বন্ধ হবে।
    const durationDays = Number(existing.durationDays) || 30;
    const planExpiresAt = isPaid
      ? new Date(
          existing.planExpiresAt &&
            new Date(existing.planExpiresAt).getTime() > Date.now()
            ? existing.planExpiresAt
            : Date.now() + durationDays * 24 * 60 * 60 * 1000
        )
      : null;

    const result = await StudentAndTeacherPaymentsStutus.updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          status: nextStatus || (isPaid ? "paid" : "pending"),
          payment: isPaid,
          planExpiresAt,
          updatedAt: new Date(),
        },
      }
    );

    // হিন্ট: স্ট্যাটাস বদলালে ইউজারের planExpiresAt রশিদের সাথে মিলিয়ে নেওয়া হচ্ছে।
    if (existing.email) {
      await syncUserPlanFromReceipts(existing.email);
    }

    return res.status(200).json({ message: "Payment updated", result });
  } catch (err) {
    console.error("PATCH /UpdatePaymentStatus error:", err);
    return res.status(500).json({ message: "Failed to update payment" });
  }
});

// হিন্ট: Admin প্যানেল থেকে পেমেন্ট রেকর্ড মুছে ফেলা হচ্ছে।
// হিন্ট: অপ্রয়োজনীয় বা ভুল রেকর্ড ডিলিট করার জন্য।
// হিন্ট: রেকর্ড মুছলে সেই ইউজারের প্ল্যানও রশিদের ভিত্তিতে আবার হিসাব করা হচ্ছে।
app.delete("/DeletePayment/:id", async (req, res) => {
  try {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid payment id" });
    }

    const existing = await StudentAndTeacherPaymentsStutus.findOne({
      _id: new ObjectId(id),
    });
    if (!existing) {
      return res.status(404).json({ message: "Payment not found" });
    }

    const result = await StudentAndTeacherPaymentsStutus.deleteOne({
      _id: new ObjectId(id),
    });

    if (existing.email) {
      await syncUserPlanFromReceipts(existing.email);
    }

    return res.status(200).json({ message: "Payment deleted", result });
  } catch (err) {
    console.error("DELETE /DeletePayment error:", err);
    return res.status(500).json({ message: "Failed to delete payment" });
  }
});

//==================================
// Admin and Tutions bio Option
// ================================
// Helper: id ba email diye user filter banano
function getBioFilter(idOrEmail, fallbackEmail = "") {
  const param = decodeURIComponent(String(idOrEmail || "")).trim();
  const cleanEmail = String(fallbackEmail || "").trim().toLowerCase();

  if (cleanEmail) {
    return { email: cleanEmail };
  }
  if (param && param.includes("@")) {
    return { email: param.toLowerCase() };
  }
  if (param && ObjectId.isValid(param)) {
    return { userId: param };
  }
  return null;
}

// 1) PATCH: Admin ba Tutor-er bio save / update kora (`BioCollection`-e)
app.patch("/SaveBio/:idOrEmail", async (req, res) => {
  try {
    const filter = getBioFilter(req.params.idOrEmail, req.body?.email);
    if (!filter) {
      return res.status(400).send({ message: "Valid email or id is required" });
    }

    const bio = String(req.body?.bio || "").trim();
    const role = String(req.body?.role || "").trim().toLowerCase();

    const updateDoc = {
      $set: {
        ...filter,
        ...(role ? { role } : {}),
        bio,
        updatedAt: new Date(),
      },
    };

    const result = await TeacherAndAdminBioCullection.updateOne(filter, updateDoc, {
      upsert: true,
    });

    return res.status(200).send({
      message: "Bio saved in BioCollection",
      bio,
      result,
    });
  } catch (error) {
    console.error("PATCH /SaveBio error:", error);
    return res.status(500).send({ message: "Failed to save bio" });
  }
});

// GET: email ba id diye BioCollection theke bio ana
app.get("/GetBio", async (req, res) => {
  try {
    const email = String(req.query?.email || "").trim().toLowerCase();
    const id = String(req.query?.id || "").trim();

    if (!email && !id) {
      return res.status(400).send({ message: "email or id is required" });
    }

    const filter = email
      ? { email }
      : ObjectId.isValid(id)
      ? { userId: id }
      : null;

    if (!filter) {
      return res.status(400).send({ message: "Invalid id or email" });
    }

    const doc = await TeacherAndAdminBioCullection.findOne(filter);

    return res.status(200).send({
      bio: doc?.bio || "",
      email: doc?.email || email,
      role: doc?.role || "",
    });
  } catch (error) {
    console.error("GET /GetBio error:", error);
    return res.status(500).send({ message: "Failed to fetch bio" });
  }
});

// 2) DELETE: Admin ba Tutor-er bio delete kora (`BioCollection` theke)
app.delete("/DeleteBio/:idOrEmail", async (req, res) => {
  try {
    const filter = getBioFilter(req.params.idOrEmail, req.query?.email);
    if (!filter) {
      return res.status(400).send({ message: "Valid email or id is required" });
    }

    const result = await TeacherAndAdminBioCullection.deleteOne(filter);

    return res.status(200).send({
      message: "Bio deleted from BioCollection",
      bio: "",
      deletedCount: result.deletedCount,
    });
  } catch (error) {
    console.error("DELETE /DeleteBio error:", error);
    return res.status(500).send({ message: "Failed to delete bio" });
  }
});

app.get('/', (req, res) => {
  res.send("amar Server Chalu Hoyche")
})

app.listen(PORT, () => {
  console.log("This Backend Port is", PORT)
})

export default app;
