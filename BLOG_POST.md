# Two months of AI-assisted development, two Microsoft 365 apps, and still no verified first Save. What would you change?

I work in operations for a small charity. I have been using AI coding agents to help build two internal applications using our existing Microsoft 365 environment.

After roughly two months, there is substantial code, plenty of tests and a lot of project documentation. But we still have not demonstrated the basic outcome I need: an employee saves their work, closes the app, reopens the same information, and another employee cannot access it.

I would appreciate an experienced developer's honest assessment of both the technical approach and how we are running the projects. I am not looking for reassurance. I want to know what we have overcomplicated, what is worth keeping and the quickest safe route to a working testable slice.

**The code and review material are together here:**

https://github.com/peteshop01-boop/m365-apps-developer-review

## The two applications

**KPI and workplans:** employees choose Core KPIs, add their own Impact KPIs, select behaviours and enter quarterly targets. They need to save private drafts, return to them and later submit a version for manager review. Managers can request changes or approve and lock the plan. Quarterly updates and reporting follow.

**Expenses:** employees enter multiple expenses, choose an account code, attach a receipt or explain its absence, and add mileage. Managers approve or query lines. Finance reviews claims and later exports for payroll. The immediate requirement is still a reliable private Save and reopen, not the whole payroll process at once.

Both use SharePoint Framework, React and TypeScript. The KPI design updates a private draft through the employee's signed-in SharePoint connection. Expenses uses a private request and a trusted Standard Microsoft workflow to validate the employee and write related records. I would welcome a challenge to either design rather than assuming they need the same solution.

## What is in the repository

There is actual application source, not just a description or screenshots. The [review guide](REVIEW_GUIDE.md) points to the screen composition, Save controllers, SharePoint gateways, permission code, workflow generators and relevant tests.

The [architecture diagrams](ARCHITECTURE_REVIEW.md) show the intended Save and approval processes. The [current issues](CURRENT_BLOCKERS.md) distinguish missing code connections, unfinished setup, unexecuted tests and missing installation evidence. There are data/schema notes, test journeys, the Expenses requirements and sprint plan, and a [delivery-process review](DELIVERY_REVIEW.md).

The two supplied source snapshots have different histories and are not necessarily the newest installed or integrated versions. A later focused KPI repair is linked separately. The guide explains that distinction rather than pretending every passing test belongs to one current release.

This is a review copy, not a deployment-ready release. Staff and financial data, credentials, tenant configuration and original private history are excluded. Missing assets and fixtures are listed. Some tests may not run without suitable fictional replacements. Please do not connect this code to a real tenant.

## What I need help understanding

1. **Have we overengineered the first Save?** What is the smallest secure implementation you would deliver first, using the useful code already here?
2. **Are the storage and permission designs sensible?** How would you create records privately from the start, prevent unrelated access and avoid employees changing ownership or approval fields?
3. **Are the reliability controls proportionate?** Expenses has substantial request, recovery and permission-checking logic. Which parts are justified, and which could be simplified without losing safety?
4. **What evidence should come before I test it?** How would you distinguish a passing mock/unit test from a working SharePoint integration and a correctly installed app?
5. **How should AI-assisted delivery be managed?** We have had checks and reviews finish without the next task starting, repeated handovers and progress reports without a usable feature. What would you change about ownership, task size, branches, reviews and handoffs?
6. **What would you do next?** Ideally, name the next three to five physical tasks for each application, their order, who should do them and the test that proves each is finished. Separate coding effort from configuration and external waiting.

I am open to being told that a particular approach is wrong, that conventional development would be more effective, or that an experienced developer needs to take ownership of a small end-to-end slice. A recommendation to rewrite or change platform would be much more useful with an explanation of what can be reused and what genuinely becomes simpler.

Feedback referring to particular files or functions would be especially helpful. Public technical comments can go in the repository's [Issues](https://github.com/peteshop01-boop/m365-apps-developer-review/issues). Please do not post confidential values or request credentials or production access.


**Current evidence clarification:** KPI has made progress with private test setup, ordinary-user reads and source wiring. That is not yet proof of an installed employee Save and fresh reopen. The [cross-project mapping](https://github.com/peteshop01-boop/m365-apps-developer-review/blob/main/KPI_TO_EXPENSES_REUSE.md) explains what Expenses can reuse and what must be tested independently.
