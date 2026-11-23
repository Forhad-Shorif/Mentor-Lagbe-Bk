import { MongoClient, ObjectId } from 'mongodb';
import cors from 'cors'
import express from 'express';
import dotenv from 'dotenv/config';

import dns from "node:dns";
dns.setServers(["8.8.8.8", "8.8.4.4"]);

const app = express();
const escapeSearchRegex = (value = "") => {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};

app.use(cors());
app.use(express.json());

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
const UsersData = db.collection("user")
const UserProfiles = db.collection("Profile");
const TeachersAddress = db.collection("Teacher-Address")
const tuitionsCollection = db.collection("Tuitions")
const applicationsCollection = db.collection("Applications")
const StudentsSavedApplications = db.collection("Saved")
const TeacherAndAdminBioCullection = db.collection("Bio")

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
//======================================================

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
        { projection: { payment: 1 } }
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

    const isPro = Boolean(user?.payment);
    if (!isPro) {
      const appliedCount = await applicationsCollection.countDocuments({
        studentEmail,
        post: { $ne: false },
      });

      if (appliedCount >= 2) {
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
    const user = await UsersData.findOne({ email: studentEmail });
    const isPro = Boolean(user?.payment);

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

    const doc = await bioCollection.findOne(filter);

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
