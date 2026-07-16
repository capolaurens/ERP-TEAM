import "dotenv/config";
import { prisma } from "../lib/prisma";
async function main(){
  const cols = await prisma.$queryRawUnsafe<{column_name:string}[]>(
    "SELECT column_name FROM information_schema.columns WHERE table_name='Task' AND column_name IN ('meshSubmittedAt','textureSubmittedAt')");
  console.log("Task cols enviado:", cols.map(r=>r.column_name).join(", ") || "FALTAN");
  const tabs = await prisma.$queryRawUnsafe<{table_name:string}[]>(
    "SELECT table_name FROM information_schema.tables WHERE table_name IN ('NorthdecoReview','NorthdecoComment')");
  console.log("Tablas Northdeco:", tabs.map(r=>r.table_name).join(", ") || "FALTAN");
}
main().then(()=>prisma.$disconnect()).catch(e=>{console.error("ERR:",e.message);process.exit(1);});
