import { ReactNode } from "react";
import { Plus } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export function ManagementHeader({ title, description, action, children }: {
  title: string;
  description: string;
  action?: string;
  children?: ReactNode;
}) {
  return (
    <div className="p-4 md:p-6">
      <div className="mb-5 flex items-center justify-between">
        <div><h2 className="text-lg font-semibold tracking-tight text-[#172033]">{title}</h2><p className="mt-0.5 text-xs text-[#697586]">{description}</p></div>
        {action && <Dialog>
          <DialogTrigger render={<button className="flex h-9 items-center gap-2 rounded-md bg-[#315EAA] px-3 text-xs font-semibold text-white shadow-sm"><Plus size={14} />{action}</button>} />
          <DialogContent>
            <DialogHeader><DialogTitle>{action}</DialogTitle></DialogHeader>
            {children}
          </DialogContent>
        </Dialog>}
      </div>
    </div>
  );
}
